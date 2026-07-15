"""Email/password auth issuing bearer JWTs — cookie-free, so a native app can use the
same endpoints as the SPA. Registering claims the caller's current guest session, which
makes everything created while anonymous permanently theirs; logging in on any device
resolves to that same session, so content follows the user."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB, CurrentUser, SessionId
from app.models import AnonSession, User
from app.schemas import AuthResponse, Credentials, GuestAuthResponse, UserOut
from app.services import auth

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
