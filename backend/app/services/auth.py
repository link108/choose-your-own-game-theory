"""Password hashing and JWT issuing/verification.

Tokens are stateless bearer JWTs (HS256, signed with JWT_SECRET) carrying only the user
id; role and session are always read from the users row so promotions and revocations
take effect immediately. Long-lived by design — the primary client is a native app that
holds the token.
"""

import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings

TOKEN_TTL = timedelta(days=30)
# guest tokens mirror the guest cookie's lifetime: possession is the whole credential
GUEST_TOKEN_TTL = timedelta(days=365)
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
        if "sub" in payload:
            return "user", uuid.UUID(payload["sub"])
        if "sid" in payload:
            return "guest", uuid.UUID(payload["sid"])
        return None
    except (jwt.InvalidTokenError, ValueError):
        return None
