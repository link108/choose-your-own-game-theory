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


async def test_refresh_rotates_and_reuse_revokes_everything(client, auth_settings):
    res = await client.post("/api/auth/register", json=CREDS)
    first = res.json()["refresh_token"]
    assert first

    res = await client.post("/api/auth/refresh", json={"refresh_token": first})
    assert res.status_code == 200
    second = res.json()["refresh_token"]
    assert second and second != first
    assert res.json()["user"]["email"] == CREDS["email"]

    # presenting the rotated-away token again is treated as theft: all sessions die
    res = await client.post("/api/auth/refresh", json={"refresh_token": first})
    assert res.status_code == 401
    res = await client.post("/api/auth/refresh", json={"refresh_token": second})
    assert res.status_code == 401


async def test_logout_revokes_refresh_token(client, auth_settings):
    refresh = (await client.post("/api/auth/register", json=CREDS)).json()["refresh_token"]

    res = await client.post("/api/auth/logout", json={"refresh_token": refresh})
    assert res.status_code == 204
    # idempotent, and the token no longer refreshes
    res = await client.post("/api/auth/logout", json={"refresh_token": refresh})
    assert res.status_code == 204
    res = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert res.status_code == 401


async def test_refresh_rejects_unknown_token(client, auth_settings):
    res = await client.post("/api/auth/refresh", json={"refresh_token": "not-a-token"})
    assert res.status_code == 401


async def test_delete_account_removes_user_and_content(client, auth_settings):
    # content made as a guest, claimed by the account at registration
    scenario_id = (await client.post("/api/scenarios", json=SCENARIO_BODY)).json()["id"]
    res = await client.post("/api/auth/register", json=CREDS)
    headers = {"Authorization": f"Bearer {res.json()['token']}"}

    res = await client.delete("/api/auth/me", headers=headers)
    assert res.status_code == 204

    # account gone: token dead, login fails, email free again
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    assert (await client.post("/api/auth/login", json=CREDS)).status_code == 401
    res = await client.post("/api/auth/register", json=CREDS)
    assert res.status_code == 201
    # and the deleted content did not follow the reused email
    headers = {"Authorization": f"Bearer {res.json()['token']}"}
    scenarios = (await client.get("/api/scenarios", headers=headers)).json()
    assert scenario_id not in [s["id"] for s in scenarios]


async def test_delete_account_requires_auth(client, auth_settings):
    assert (await client.delete("/api/auth/me")).status_code == 401


def _fake_apple(monkeypatch, sub="apple-sub-1", email="apple@example.com", verified=True):
    from app.services.apple import AppleIdentity

    monkeypatch.setattr(
        "app.services.apple.verify_identity_token",
        lambda token: AppleIdentity(sub=sub, email=email, email_verified=verified),
    )


async def test_apple_sign_in_disabled_without_bundle_id(client, auth_settings):
    auth_settings.apple_bundle_id = ""
    res = await client.post("/api/auth/apple", json={"identity_token": "x"})
    assert res.status_code == 503


async def test_apple_sign_in_creates_account_and_claims_guest_content(
    client, auth_settings, monkeypatch
):
    scenario_id = (await client.post("/api/scenarios", json=SCENARIO_BODY)).json()["id"]

    _fake_apple(monkeypatch)
    res = await client.post("/api/auth/apple", json={"identity_token": "whatever"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "apple@example.com"
    assert body["user"]["email_verified"] is True
    headers = {"Authorization": f"Bearer {body['token']}"}
    res = await client.get("/api/scenarios", headers=headers)
    assert [s["id"] for s in res.json()] == [scenario_id]

    # same Apple subject later, even without an email claim: the same account
    _fake_apple(monkeypatch, email="")
    res = await client.post("/api/auth/apple", json={"identity_token": "again"})
    assert res.json()["user"]["id"] == body["user"]["id"]


async def test_apple_sign_in_links_existing_email_account(client, auth_settings, monkeypatch):
    await client.post("/api/auth/register", json=CREDS)

    _fake_apple(monkeypatch, sub="apple-sub-2", email=CREDS["email"])
    res = await client.post("/api/auth/apple", json={"identity_token": "x"})
    assert res.status_code == 200
    assert res.json()["user"]["email"] == CREDS["email"]
    # linking must not break password login
    assert (await client.post("/api/auth/login", json=CREDS)).status_code == 200


async def test_apple_sign_in_rejects_bad_token(client, auth_settings, monkeypatch):
    from app.services.apple import AppleVerificationError

    def boom(token):
        raise AppleVerificationError("invalid Apple identity token: bad signature")

    monkeypatch.setattr("app.services.apple.verify_identity_token", boom)
    res = await client.post("/api/auth/apple", json={"identity_token": "bad"})
    assert res.status_code == 401


async def test_admin_email_grants_role_and_login_promotes(client, auth_settings):
    creds = {"email": auth_settings.admin_email, "password": "password123"}

    # registered before ADMIN_EMAIL was configured
    auth_settings.admin_email = ""
    res = await client.post("/api/auth/register", json=creds)
    assert res.json()["user"]["role"] == "user"

    auth_settings.admin_email = creds["email"]
    res = await client.post("/api/auth/login", json=creds)
    assert res.json()["user"]["role"] == "admin"
