"""Transactional email via Resend (plain httpx, no SDK).

While RESEND_API_KEY is unset every email is logged instead of sent — including its
links — so the full verify/reset flows are walkable in local dev. Sends happen off the
request path via send_in_background(); a failed email never fails the request.
"""

import asyncio
import logging
import time
import uuid
from collections.abc import Coroutine

import httpx

from app.config import get_settings
from app.metrics import NOTIFICATIONS_SENT, observe_dependency
from app.services import auth

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"

# (category, email) -> recent send timestamps; in-memory is fine at one replica, and a
# restart resetting the window is acceptable for a 3/hour courtesy limit
_SEND_LOG: dict[tuple[str, str], list[float]] = {}
RATE_LIMIT = 3
RATE_WINDOW_S = 3600


def allow_send(category: str, email: str) -> bool:
    key = (category, email.lower())
    now = time.monotonic()
    recent = [t for t in _SEND_LOG.get(key, []) if now - t < RATE_WINDOW_S]
    if len(recent) >= RATE_LIMIT:
        _SEND_LOG[key] = recent
        return False
    recent.append(now)
    _SEND_LOG[key] = recent
    return True


def send_in_background(coro: Coroutine) -> None:
    task = asyncio.create_task(coro)

    def _log_failure(t: asyncio.Task) -> None:
        if not t.cancelled() and t.exception() is not None:
            logger.error("email send failed", exc_info=t.exception())

    task.add_done_callback(_log_failure)


async def _send(to: str, subject: str, html: str, text: str, category: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.info(
            "email (not sent, RESEND_API_KEY unset) to=%s subject=%r\n%s", to, subject, text
        )
        NOTIFICATIONS_SENT.labels("email", "skipped").inc()
        return
    async with httpx.AsyncClient(timeout=10) as client:
        started_at = time.perf_counter()
        try:
            resp = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                    "tags": [{"name": "category", "value": category}],
                },
            )
            resp.raise_for_status()
        except Exception:
            observe_dependency("resend", "send_email", "error", started_at)
            NOTIFICATIONS_SENT.labels("email", "failed").inc()
            raise
        observe_dependency("resend", "send_email", "success", started_at)
        NOTIFICATIONS_SENT.labels("email", "sent").inc()
        logger.info("email sent to=%s category=%s id=%s", to, category, resp.json().get("id"))


def _layout(title: str, body_html: str) -> str:
    style = (
        "font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; "
        "max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;"
    )
    return f"""\
<div style="{style}">
  <h2 style="margin: 0 0 16px;">Scenario Sim</h2>
  <h3 style="margin: 0 0 12px;">{title}</h3>
  {body_html}
  <p style="margin-top: 24px; font-size: 12px; color: #888;">
    If you didn't expect this email you can safely ignore it.
  </p>
</div>"""


def _button(href: str, label: str) -> str:
    return (
        f'<p style="margin: 20px 0;"><a href="{href}" style="background: #4f46e5; color: #fff; '
        f'padding: 10px 20px; border-radius: 6px; text-decoration: none;">{label}</a></p>'
        f'<p style="font-size: 12px; color: #888;">Or paste this link into your browser:'
        f"<br>{href}</p>"
    )


async def send_welcome_email(to: str) -> None:
    await _send(
        to,
        subject="Welcome to Scenario Sim",
        html=_layout(
            "Welcome!",
            "<p>Your account is ready. Jump into the library, pick a scenario, and see how "
            "your choices play out.</p>"
            f"{_button(get_settings().app_base_url, 'Open Scenario Sim')}",
        ),
        text=(
            "Welcome to Scenario Sim!\n\n"
            "Your account is ready. Jump into the library, pick a scenario, and see how "
            f"your choices play out.\n\n{get_settings().app_base_url}\n"
        ),
        category="welcome",
    )


async def send_verification_email(to: str, user_id: uuid.UUID) -> None:
    link = f"{get_settings().app_base_url}/verify-email?token={auth.create_verify_token(user_id)}"
    await _send(
        to,
        subject="Verify your email",
        html=_layout(
            "Verify your email",
            "<p>Confirm this is your address to finish setting up your account. "
            "The link is valid for 24 hours.</p>"
            f"{_button(link, 'Verify email')}",
        ),
        text=(
            "Verify your email\n\n"
            "Confirm this is your address to finish setting up your account. "
            f"The link is valid for 24 hours.\n\n{link}\n"
        ),
        category="verification",
    )


async def send_password_reset_email(to: str, user_id: uuid.UUID, password_hash: str) -> None:
    token = auth.create_reset_token(user_id, password_hash)
    link = f"{get_settings().app_base_url}/reset-password?token={token}"
    await _send(
        to,
        subject="Reset your password",
        html=_layout(
            "Reset your password",
            "<p>Someone (hopefully you) asked to reset the password for this account. "
            "The link is valid for 1 hour and can be used once.</p>"
            f"{_button(link, 'Reset password')}",
        ),
        text=(
            "Reset your password\n\n"
            "Someone (hopefully you) asked to reset the password for this account. "
            f"The link is valid for 1 hour and can be used once.\n\n{link}\n"
        ),
        category="password-reset",
    )
