"""Email flows: verification and password reset (Resend integration).

Emails are captured by the outbox fixture; tokens are pulled out of the captured link.
"""

import asyncio
import re
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings

CREDS = {"email": "player@example.com", "password": "password123"}


async def drain():
    """Let fire-and-forget email tasks finish (the fake sender never awaits I/O)."""
    for _ in range(3):
        await asyncio.sleep(0)


def token_from(email: dict) -> str:
    return re.search(r"token=(\S+)", email["text"]).group(1)


def expired_token(user_id: str, purpose: str) -> str:
    payload = {
        "sub": user_id,
        "purpose": purpose,
        "exp": datetime.now(UTC) - timedelta(minutes=1),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


async def register(client) -> dict:
    res = await client.post("/api/auth/register", json=CREDS)
    assert res.status_code == 201
    await drain()
    return res.json()


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


async def test_register_sends_welcome_and_verification(client, auth_settings, outbox):
    body = await register(client)
    assert body["user"]["email_verified"] is False
    assert [(e["to"], e["category"]) for e in outbox] == [
        (CREDS["email"], "welcome"),
        (CREDS["email"], "verification"),
    ]
    assert "/verify-email?token=" in outbox[1]["text"]


async def test_verify_email_roundtrip_and_idempotency(client, auth_settings, outbox):
    body = await register(client)
    token = token_from(outbox[1])

    res = await client.post("/api/auth/verify-email", json={"token": token})
    assert res.status_code == 200
    assert res.json()["email_verified"] is True

    res = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert res.json()["email_verified"] is True

    # re-clicking the link stays a 200
    res = await client.post("/api/auth/verify-email", json={"token": token})
    assert res.status_code == 200


async def test_verify_email_rejects_bad_tokens(client, auth_settings, outbox):
    body = await register(client)
    user_id = body["user"]["id"]

    for bad in [
        "not-a-jwt",
        expired_token(user_id, "verify"),
        expired_token(str(uuid.uuid4()), "verify"),
        body["token"],  # a login token is not a verify token
    ]:
        res = await client.post("/api/auth/verify-email", json={"token": bad})
        assert res.status_code == 400


async def test_purpose_tokens_are_not_login_tokens(client, auth_settings, outbox):
    await register(client)
    verify_token = token_from(outbox[1])

    res = await client.post(
        "/api/auth/request-password-reset", json={"email": CREDS["email"]}
    )
    assert res.status_code == 202
    await drain()
    reset_token = token_from(outbox[2])

    for stolen in [verify_token, reset_token]:
        res = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {stolen}"}
        )
        assert res.status_code == 401


async def test_resend_verification(client, auth_settings, outbox):
    body = await register(client)
    headers = {"Authorization": f"Bearer {body['token']}"}

    for _ in range(3):
        res = await client.post("/api/auth/resend-verification", headers=headers)
        assert res.status_code == 202
    await drain()
    assert len(outbox) == 5  # welcome + register verification + 3 resends

    # 4th within the window is rate-limited
    res = await client.post("/api/auth/resend-verification", headers=headers)
    assert res.status_code == 429

    token = token_from(outbox[-1])
    await client.post("/api/auth/verify-email", json={"token": token})
    res = await client.post("/api/auth/resend-verification", headers=headers)
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


async def test_request_reset_is_enumeration_safe(client, auth_settings, outbox):
    res = await client.post(
        "/api/auth/request-password-reset", json={"email": "nobody@example.com"}
    )
    assert res.status_code == 202
    detail = res.json()["detail"]
    await drain()
    assert outbox == []

    await register(client)
    outbox.clear()
    res = await client.post(
        "/api/auth/request-password-reset", json={"email": CREDS["email"]}
    )
    assert res.status_code == 202
    assert res.json()["detail"] == detail  # identical message either way
    await drain()
    assert [e["category"] for e in outbox] == ["password-reset"]


async def test_reset_password_roundtrip_and_single_use(client, auth_settings, outbox):
    await register(client)
    await client.post("/api/auth/request-password-reset", json={"email": CREDS["email"]})
    await drain()
    token = token_from(outbox[-1])

    res = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "new-password-456"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email_verified"] is True  # reset proves inbox ownership
    res = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert res.status_code == 200

    res = await client.post("/api/auth/login", json=CREDS)
    assert res.status_code == 401
    res = await client.post(
        "/api/auth/login", json={**CREDS, "password": "new-password-456"}
    )
    assert res.status_code == 200

    # the token was bound to the old hash: second use fails
    res = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "another-pass-789"}
    )
    assert res.status_code == 400


async def test_reset_password_rejects_bad_tokens(client, auth_settings, outbox):
    body = await register(client)
    user_id = body["user"]["id"]
    verify_token = token_from(outbox[1])

    for bad in ["not-a-jwt", expired_token(user_id, "reset"), verify_token, body["token"]]:
        res = await client.post(
            "/api/auth/reset-password", json={"token": bad, "password": "new-password-456"}
        )
        assert res.status_code == 400


async def test_rate_limited_reset_requests_stay_silent(client, auth_settings, outbox):
    await register(client)
    outbox.clear()
    for _ in range(4):
        res = await client.post(
            "/api/auth/request-password-reset", json={"email": CREDS["email"]}
        )
        assert res.status_code == 202  # the limiter must not be observable either
    await drain()
    assert len(outbox) == 3
