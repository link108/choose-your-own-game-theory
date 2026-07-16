"""Password hashing and JWT issuing/verification.

Tokens are stateless bearer JWTs (HS256, signed with JWT_SECRET) carrying only the user
id; role and session are always read from the users row so promotions and revocations
take effect immediately. Long-lived by design — the primary client is a native app that
holds the token.
"""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings

TOKEN_TTL = timedelta(days=30)
# guest tokens mirror the guest cookie's lifetime: possession is the whole credential
GUEST_TOKEN_TTL = timedelta(days=365)
VERIFY_TOKEN_TTL = timedelta(hours=24)
RESET_TOKEN_TTL = timedelta(hours=1)
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: uuid.UUID) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(UTC) + TOKEN_TTL}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def create_guest_token(session_id: uuid.UUID) -> str:
    """A bearer credential for an account-less session — the native-app equivalent of
    the guest cookie."""
    payload = {"sid": str(session_id), "exp": datetime.now(UTC) + GUEST_TOKEN_TTL}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def parse_token(token: str) -> tuple[str, uuid.UUID] | None:
    """("user", user_id) or ("guest", session_id) from a valid token, else None."""
    secret = get_settings().jwt_secret
    if not secret:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
        # email verify/reset tokens also carry "sub" but must never act as login
        # credentials — a leaked reset link would otherwise be a session
        if "purpose" in payload:
            return None
        if "sub" in payload:
            return "user", uuid.UUID(payload["sub"])
        if "sid" in payload:
            return "guest", uuid.UUID(payload["sid"])
        return None
    except (jwt.InvalidTokenError, ValueError):
        return None


def _pwd_fragment(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_verify_token(user_id: uuid.UUID) -> str:
    payload = {
        "sub": str(user_id),
        "purpose": "verify",
        "exp": datetime.now(UTC) + VERIFY_TOKEN_TTL,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def create_reset_token(user_id: uuid.UUID, password_hash: str) -> str:
    """Single-use without server-side state: binds to the current password hash, so the
    token dies the moment the password changes."""
    payload = {
        "sub": str(user_id),
        "purpose": "reset",
        "pwd": _pwd_fragment(password_hash),
        "exp": datetime.now(UTC) + RESET_TOKEN_TTL,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def parse_purpose_token(token: str, purpose: str) -> dict | None:
    """The decoded payload of a valid verify/reset token of the given purpose, else None."""
    secret = get_settings().jwt_secret
    if not secret:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    if payload.get("purpose") != purpose or "sub" not in payload:
        return None
    return payload
