"""Single entry point for all LLM calls: caching, JSON parsing, validation, retry.

Every generation flows through `generate()`, which:
  1. returns a cached response from `llm_calls` when the exact same request was made before
  2. otherwise calls DeepSeek in JSON mode
  3. validates the output against a Pydantic schema (shape + semantic rules)
  4. on validation failure, retries with the validation errors fed back to the model
  5. persists the successful response so replays are free and auditable
"""

import hashlib
import json
import logging
import re

from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import LLMCall

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """The model could not produce valid output within the attempt budget."""


def _client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        timeout=120.0,
        max_retries=1,
    )


async def _chat(messages: list[dict]) -> str:
    """Raw model call; tests monkeypatch this."""
    settings = get_settings()
    completion = await _client().chat.completions.create(
        model=settings.deepseek_model,
        messages=messages,
        response_format={"type": "json_object"},
    )
    return completion.choices[0].message.content or ""


def cache_key(kind: str, system: str, user: str, regen_nonce: int) -> str:
    settings = get_settings()
    canonical = json.dumps(
        {
            "model": settings.deepseek_model,
            "kind": kind,
            "system": system,
            "user": user,
            "nonce": regen_nonce,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _parse_json(content: str) -> dict:
    content = content.strip()
    # tolerate a markdown fence despite JSON mode
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", content, re.DOTALL)
    if fenced:
        content = fenced.group(1)
    return json.loads(content)


async def generate[T: BaseModel](
    db: AsyncSession,
    kind: str,
    system: str,
    user: str,
    output_schema: type[T],
    *,
    regen_nonce: int = 0,
) -> T:
    key = cache_key(kind, system, user, regen_nonce)

    cached = await db.scalar(select(LLMCall).where(LLMCall.cache_key == key))
    if cached is not None:
        return output_schema.model_validate(cached.response)

    if regen_nonce > 0:
        user = (
            f"{user}\n\nThis is regeneration attempt #{regen_nonce}: produce a fresh, "
            "meaningfully different variation from any previous answer."
        )

    settings = get_settings()
    messages: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    last_error = ""
    for attempt in range(settings.llm_max_attempts):
        content = await _chat(messages)
        try:
            data = _parse_json(content)
            result = output_schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = str(exc)
            logger.warning("LLM output invalid (kind=%s attempt=%d): %s", kind, attempt, exc)
            messages.append({"role": "assistant", "content": content})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Your previous response was invalid:\n"
                        f"{exc}\n\n"
                        "Respond again with a single corrected JSON object that satisfies "
                        "the original instructions. Do not apologize or add commentary."
                    ),
                }
            )
            continue

        db.add(
            LLMCall(
                cache_key=key,
                kind=kind,
                request={
                    "model": settings.deepseek_model,
                    "system": system,
                    "user": user,
                    "nonce": regen_nonce,
                    "attempts": attempt + 1,
                },
                response=data,
            )
        )
        await db.commit()
        return result

    raise LLMError(
        f"model failed to produce valid {output_schema.__name__} "
        f"after {settings.llm_max_attempts} attempts: {last_error}"
    )
