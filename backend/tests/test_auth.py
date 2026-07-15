"""Auth: register/login/me, session claiming, cross-device identity, admin role."""

from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import SCENARIO_BODY

CREDS = {"email": "player@example.com", "password": "password123"}


async def test_auth_disabled_without_jwt_secret(client):
    res = await client.post("/api/auth/register", json=CREDS)
    assert res.status_code == 503


async def test_register_login_me_roundtrip(client, auth_settings):
    res = await client.post("/api/auth/register", json=CREDS)
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["email"] == CREDS["email"]
    assert body["user"]["role"] == "user"

    res = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert res.status_code == 200
    assert res.json()["email"] == CREDS["email"]

    res = await client.post("/api/auth/login", json=CREDS)
    assert res.status_code == 200
    res = await client.post("/api/auth/login", json={**CREDS, "password": "wrong-password"})
    assert res.status_code == 401


async def test_duplicate_email_rejected(client, auth_settings):
    await client.post("/api/auth/register", json=CREDS)
    res = await client.post("/api/auth/register", json={**CREDS, "email": "PLAYER@example.com"})
    assert res.status_code == 409


async def test_me_rejects_missing_or_bad_token(client, auth_settings):
    res = await client.get("/api/auth/me")
    assert res.status_code == 401
    res = await client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


async def test_bad_token_still_allows_guest_browsing(client, auth_settings):
    res = await client.get(
        "/api/scenarios", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert res.status_code == 200


async def test_register_claims_guest_content_and_follows_across_devices(
    client, session_maker, auth_settings
):
    # play as a guest first
    res = await client.post("/api/scenarios", json=SCENARIO_BODY)
    scenario_id = res.json()["id"]

    res = await client.post("/api/auth/register", json=CREDS)
    token = res.json()["token"]

    # a different device: fresh client, no cookies, bearer token only
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as other_device:
        res = await other_device.get(
            "/api/scenarios", headers={"Authorization": f"Bearer {token}"}
        )
        assert [s["id"] for s in res.json()] == [scenario_id]


async def test_second_registration_on_same_browser_gets_fresh_identity(
    client, auth_settings
):
    await client.post("/api/scenarios", json=SCENARIO_BODY)
    await client.post("/api/auth/register", json=CREDS)

    # same browser (same guest cookie), different account
    res = await client.post(
        "/api/auth/register", json={"email": "second@example.com", "password": "password123"}
    )
    assert res.status_code == 201
    res = await client.get(
        "/api/scenarios", headers={"Authorization": f"Bearer {res.json()['token']}"}
    )
    assert res.json() == []


async def test_guest_token_flow_and_upgrade_to_account(client, auth_settings):
    res = await client.post("/api/auth/guest")
    assert res.status_code == 201
    guest_headers = {"Authorization": f"Bearer {res.json()['token']}"}

    # a native app: no cookies at all, guest bearer only
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as device:
        res = await device.post("/api/scenarios", json=SCENARIO_BODY, headers=guest_headers)
        assert res.status_code == 201
        scenario_id = res.json()["id"]
        res = await device.get("/api/scenarios", headers=guest_headers)
        assert [s["id"] for s in res.json()] == [scenario_id]

        # registering with the guest token upgrades that session to the account
        res = await device.post("/api/auth/register", json=CREDS, headers=guest_headers)
        assert res.status_code == 201
        account_headers = {"Authorization": f"Bearer {res.json()['token']}"}
        res = await device.get("/api/scenarios", headers=account_headers)
        assert [s["id"] for s in res.json()] == [scenario_id]


async def test_guest_endpoint_disabled_without_jwt_secret(client):
    res = await client.post("/api/auth/guest")
    assert res.status_code == 503


async def test_admin_email_grants_role_and_login_promotes(client, auth_settings):
    creds = {"email": auth_settings.admin_email, "password": "password123"}

    # registered before ADMIN_EMAIL was configured
    auth_settings.admin_email = ""
    res = await client.post("/api/auth/register", json=creds)
    assert res.json()["user"]["role"] == "user"

    auth_settings.admin_email = creds["email"]
    res = await client.post("/api/auth/login", json=creds)
    assert res.json()["user"]["role"] == "admin"
