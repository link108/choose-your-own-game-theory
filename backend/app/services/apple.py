"""Sign in with Apple: server-side verification of the identity token the iOS app
obtains from AuthenticationServices.

Verification is standard OIDC: check the RS256 signature against Apple's published
JWKS, then require our bundle id as the audience and Apple as the issuer. The functions
here are synchronous (PyJWKClient fetches keys over urllib) — call them via
anyio.to_thread from async handlers.
"""

import time
from dataclasses import dataclass

import jwt

from app.config import get_settings
from app.metrics import observe_dependency

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"


class AppleVerificationError(Exception):
    """The identity token failed verification (bad signature, audience, or expiry)."""


@dataclass
class AppleIdentity:
    sub: str
    email: str  # may be "" — Apple omits it in rare re-auth flows
    email_verified: bool


_jwks_client: jwt.PyJWKClient | None = None


def _client() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(APPLE_JWKS_URL, cache_keys=True)
    return _jwks_client


def verify_identity_token(token: str) -> AppleIdentity:
    started_at = time.perf_counter()
    try:
        key = _client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=get_settings().apple_bundle_id,
            issuer=APPLE_ISSUER,
        )
    except jwt.PyJWTError as exc:
        observe_dependency("apple_identity", "verify_token", "invalid", started_at)
        raise AppleVerificationError(f"invalid Apple identity token: {exc}") from exc
    except Exception:
        observe_dependency("apple_identity", "verify_token", "error", started_at)
        raise
    # email_verified arrives as bool or the string "true" depending on the flow
    verified = payload.get("email_verified") in (True, "true")
    identity = AppleIdentity(
        sub=payload["sub"],
        email=(payload.get("email") or "").strip().lower(),
        email_verified=verified,
    )
    observe_dependency("apple_identity", "verify_token", "success", started_at)
    return identity
