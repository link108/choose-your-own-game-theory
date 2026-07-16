"""Email/password auth issuing bearer JWTs — cookie-free, so a native app can use the
same endpoints as the SPA. Registering claims the caller's current guest session, which
makes everything created while anonymous permanently theirs; logging in on any device
resolves to that same session, so content follows the user."""

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB, CurrentUser, SessionId
from app.models import AnonSession, User
from app.schemas import (
    AuthResponse,
    Credentials,
    EmailTokenRequest,
    GuestAuthResponse,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    UserOut,
)
from app.services import auth
from app.services import email as email_svc

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _require_auth_enabled() -> None:
    if not get_settings().jwt_secret:
        raise HTTPException(status_code=503, detail="auth is not configured (JWT_SECRET unset)")


def _role_for(email: str) -> str:
    admin_email = get_settings().admin_email.strip().lower()
    return "admin" if admin_email and email == admin_email else "user"


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(token=auth.create_token(user.id), user=UserOut.model_validate(user))


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

    # claim the caller's guest session so anything they made while anonymous stays theirs;
    # if this browser's session already belongs to another account, start a fresh one
    claimed = await db.scalar(select(User.id).where(User.session_id == session_id))
    if claimed is not None:
        session = AnonSession()
        db.add(session)
        await db.flush()
        session_id = session.id

    user = User(
        email=email,
        password_hash=auth.hash_password(body.password),
        role=_role_for(email),
        session_id=session_id,
    )
    db.add(user)
    await db.commit()
    email_svc.send_in_background(email_svc.send_welcome_email(user.email))
    email_svc.send_in_background(email_svc.send_verification_email(user.email, user.id))
    return _auth_response(user)


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
        await db.commit()
    return _auth_response(user)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user


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
    await db.commit()
    return _auth_response(user)


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
