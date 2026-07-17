"""Email/password auth issuing bearer JWTs — cookie-free, so a native app can use the
same endpoints as the SPA. Registering claims the caller's current guest session, which
makes everything created while anonymous permanently theirs; logging in on any device
resolves to that same session, so content follows the user."""

import uuid
from datetime import UTC, datetime

import anyio.to_thread
from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, select, update

from app.config import get_settings
from app.deps import DB, CurrentUser, SessionId
from app.models import (
    AnonSession,
    Playthrough,
    RefreshToken,
    Scenario,
    ScenarioInsight,
    Turn,
    User,
)
from app.schemas import (
    AppleSignInRequest,
    AuthResponse,
    Credentials,
    EmailTokenRequest,
    GuestAuthResponse,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    UserOut,
)
from app.services import apple, auth
from app.services import email as email_svc

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _require_auth_enabled() -> None:
    if not get_settings().jwt_secret:
        raise HTTPException(status_code=503, detail="auth is not configured (JWT_SECRET unset)")


def _role_for(email: str) -> str:
    admin_email = get_settings().admin_email.strip().lower()
    return "admin" if admin_email and email == admin_email else "user"


async def _auth_response(db: DB, user: User) -> AuthResponse:
    """Mint the session pair (short-lived access JWT + stored refresh token) and
    commit — every sign-in path funnels through here."""
    refresh = auth.new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=auth.hash_refresh_token(refresh),
            expires_at=datetime.now(UTC) + auth.REFRESH_TOKEN_TTL,
        )
    )
    await db.commit()
    return AuthResponse(
        token=auth.create_token(user.id),
        refresh_token=refresh,
        user=UserOut.model_validate(user),
    )


async def _claim_session(db: DB, session_id: uuid.UUID) -> uuid.UUID:
    """The session a new account should own: the caller's guest session, so everything
    made while anonymous stays theirs — or a fresh one if that session already belongs
    to another account."""
    claimed = await db.scalar(select(User.id).where(User.session_id == session_id))
    if claimed is None:
        return session_id
    session = AnonSession()
    db.add(session)
    await db.flush()
    return session.id


@router.post("/guest", response_model=GuestAuthResponse, status_code=201)
async def guest(db: DB) -> GuestAuthResponse:
    """A fresh account-less identity as a bearer token — the native-app counterpart of
    the browser's guest cookie. Registering later while sending this token upgrades the
    session to the new account, content included."""
    _require_auth_enabled()
    session = AnonSession()
    db.add(session)
    await db.commit()
    return GuestAuthResponse(token=auth.create_guest_token(session.id))


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(body: Credentials, db: DB, session_id: SessionId) -> AuthResponse:
    _require_auth_enabled()
    email = body.email.strip().lower()
    existing = await db.scalar(select(User.id).where(func.lower(User.email) == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="an account with this email already exists")

    user = User(
        email=email,
        password_hash=auth.hash_password(body.password),
        role=_role_for(email),
        session_id=await _claim_session(db, session_id),
    )
    db.add(user)
    await db.flush()
    email_svc.send_in_background(email_svc.send_welcome_email(user.email))
    email_svc.send_in_background(email_svc.send_verification_email(user.email, user.id))
    return await _auth_response(db, user)


@router.post("/login", response_model=AuthResponse)
async def login(body: Credentials, db: DB) -> AuthResponse:
    _require_auth_enabled()
    email = body.email.strip().lower()
    user = await db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid email or password")
    # self-healing promotion: ADMIN_EMAIL may be configured after the account was created
    role = _role_for(email)
    if role == "admin" and user.role != "admin":
        user.role = "admin"
    return await _auth_response(db, user)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user


@router.post("/refresh", response_model=AuthResponse)
async def refresh_session(body: RefreshRequest, db: DB) -> AuthResponse:
    """Rotate the refresh token and mint a fresh access JWT."""
    _require_auth_enabled()
    invalid = HTTPException(status_code=401, detail="invalid or expired refresh token")
    now = datetime.now(UTC)
    row = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == auth.hash_refresh_token(body.refresh_token)
        )
    )
    if row is None:
        raise invalid
    if row.revoked_at is not None:
        # a rotated-away token coming back means it was stolen (or the legitimate
        # client lost the race) — revoke everything and force a fresh sign-in
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == row.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.commit()
        raise invalid
    if auth.as_utc(row.expires_at) < now:
        raise invalid
    user = await db.get(User, row.user_id)
    if user is None:
        raise invalid
    row.revoked_at = now
    return await _auth_response(db, user)


@router.post("/logout", status_code=204)
async def logout(body: RefreshRequest, db: DB) -> None:
    """Revoke the presented refresh token. Best-effort by design: an unknown token is
    already logged out, so there is nothing to reveal by failing."""
    _require_auth_enabled()
    row = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == auth.hash_refresh_token(body.refresh_token)
        )
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        await db.commit()


@router.post("/apple", response_model=AuthResponse)
async def apple_sign_in(body: AppleSignInRequest, db: DB, session_id: SessionId) -> AuthResponse:
    """Sign in (or up) with a verified Apple identity token. Matches by Apple subject
    first, then links by email, then creates an account — new accounts claim the
    caller's guest session exactly like register does."""
    _require_auth_enabled()
    if not get_settings().apple_bundle_id:
        raise HTTPException(
            status_code=503, detail="Sign in with Apple is not configured (APPLE_BUNDLE_ID unset)"
        )
    try:
        # sync urllib JWKS fetch inside — keep it off the event loop
        identity = await anyio.to_thread.run_sync(
            apple.verify_identity_token, body.identity_token
        )
    except apple.AppleVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = await db.scalar(select(User).where(User.apple_sub == identity.sub))
    if user is None and identity.email:
        user = await db.scalar(select(User).where(func.lower(User.email) == identity.email))
        if user is not None:
            user.apple_sub = identity.sub
    if user is None:
        if not identity.email:
            raise HTTPException(
                status_code=400, detail="Apple did not provide an email for this account"
            )
        user = User(
            email=identity.email,
            password_hash="",  # no password; bcrypt verification always fails on ""
            role=_role_for(identity.email),
            apple_sub=identity.sub,
            email_verified=identity.email_verified,
            session_id=await _claim_session(db, session_id),
        )
        db.add(user)
        await db.flush()
        email_svc.send_in_background(email_svc.send_welcome_email(user.email))
    return await _auth_response(db, user)


@router.delete("/me", status_code=204)
async def delete_account(user: CurrentUser, db: DB) -> None:
    """Permanently delete the account and everything it owns (App Store requires this
    in-app). Explicit deletes child-first rather than relying on DB cascades, so the
    behavior is identical on every backend."""
    sid = user.session_id
    owned_playthroughs = select(Playthrough.id).where(Playthrough.owner_session_id == sid)
    await db.execute(delete(Turn).where(Turn.playthrough_id.in_(owned_playthroughs)))
    await db.execute(delete(Playthrough).where(Playthrough.owner_session_id == sid))
    await db.execute(delete(ScenarioInsight).where(ScenarioInsight.owner_session_id == sid))
    await db.execute(delete(Scenario).where(Scenario.owner_session_id == sid))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await db.delete(user)
    await db.execute(delete(AnonSession).where(AnonSession.id == sid))
    await db.commit()


@router.post("/request-password-reset", response_model=MessageResponse, status_code=202)
async def request_password_reset(body: PasswordResetRequest, db: DB) -> MessageResponse:
    """Always 202 with the same message — whether the account exists, and whether the
    send was rate-limited, must not be observable (email enumeration)."""
    _require_auth_enabled()
    email = body.email.strip().lower()
    user = await db.scalar(select(User).where(func.lower(User.email) == email))
    if user is not None and email_svc.allow_send("password-reset", email):
        email_svc.send_in_background(
            email_svc.send_password_reset_email(user.email, user.id, user.password_hash)
        )
    return MessageResponse(detail="If that email has an account, a reset link is on the way.")


@router.post("/reset-password", response_model=AuthResponse)
async def reset_password(body: PasswordResetConfirm, db: DB) -> AuthResponse:
    _require_auth_enabled()
    invalid = HTTPException(status_code=400, detail="invalid or expired reset link")
    payload = auth.parse_purpose_token(body.token, "reset")
    if payload is None:
        raise invalid
    user = await db.get(User, uuid.UUID(payload["sub"]))
    # the pwd fragment binds the token to the hash it was minted against, making it
    # single-use; one uniform error for every failure mode
    if user is None or payload.get("pwd") != auth._pwd_fragment(user.password_hash):
        raise invalid
    user.password_hash = auth.hash_password(body.password)
    user.email_verified = True  # completing the reset proves they own the inbox
    # a reset is the recover-from-compromise path: sign every device out
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    return await _auth_response(db, user)


@router.post("/resend-verification", response_model=MessageResponse, status_code=202)
async def resend_verification(user: CurrentUser) -> MessageResponse:
    _require_auth_enabled()
    if user.email_verified:
        raise HTTPException(status_code=400, detail="email already verified")
    if not email_svc.allow_send("verify", user.email):
        raise HTTPException(status_code=429, detail="too many requests — try again later")
    email_svc.send_in_background(email_svc.send_verification_email(user.email, user.id))
    return MessageResponse(detail="Verification email sent.")


@router.post("/verify-email", response_model=UserOut)
async def verify_email(body: EmailTokenRequest, db: DB) -> User:
    _require_auth_enabled()
    payload = auth.parse_purpose_token(body.token, "verify")
    user = None if payload is None else await db.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=400, detail="invalid or expired verification link")
    if not user.email_verified:  # idempotent: re-clicking the link stays a 200
        user.email_verified = True
        await db.commit()
    return user
