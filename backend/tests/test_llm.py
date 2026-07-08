import json

import pytest
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.models import LLMCall
from app.services import llm


class Echo(BaseModel):
    message: str = Field(min_length=1)


async def test_cache_hit_skips_model(db, fake_chat):
    fake = fake_chat(json.dumps({"message": "hello"}))

    first = await llm.generate(db, "echo", "sys", "user", Echo)
    second = await llm.generate(db, "echo", "sys", "user", Echo)

    assert first.message == second.message == "hello"
    assert len(fake.calls) == 1
    count = await db.scalar(select(func.count()).select_from(LLMCall))
    assert count == 1


async def test_regen_nonce_misses_cache(db, fake_chat):
    fake = fake_chat(json.dumps({"message": "hello"}))

    await llm.generate(db, "echo", "sys", "user", Echo)
    await llm.generate(db, "echo", "sys", "user", Echo, regen_nonce=1)

    assert len(fake.calls) == 2
    # the regen prompt asks for a variation
    assert "regeneration attempt" in fake.calls[1][1]["content"]


async def test_invalid_output_retries_with_errors(db, fake_chat):
    fake = fake_chat("not json at all", json.dumps({"message": ""}), json.dumps({"message": "ok"}))

    result = await llm.generate(db, "echo", "sys", "user", Echo)

    assert result.message == "ok"
    assert len(fake.calls) == 3
    # the retry conversation includes the model's bad answer and the validation error
    retry_messages = fake.calls[2]
    assert any(m["role"] == "assistant" for m in retry_messages)
    assert any("invalid" in m["content"] for m in retry_messages if m["role"] == "user")


async def test_gives_up_after_max_attempts(db, fake_chat):
    fake = fake_chat("still not json")

    with pytest.raises(llm.LLMError):
        await llm.generate(db, "echo", "sys", "user", Echo)

    assert len(fake.calls) == 3  # llm_max_attempts default
    count = await db.scalar(select(func.count()).select_from(LLMCall))
    assert count == 0
