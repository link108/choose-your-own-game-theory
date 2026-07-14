import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session_maker(db_engine):
    return async_sessionmaker(db_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db(session_maker):
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def client(session_maker):
    async def override():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def turn_json(narrative="You arrive at the office.", options=None, is_final=False, epilogue=""):
    """A valid TurnGeneration payload; the hidden marker strings let tests assert leaks."""
    if options is None:
        options = ["Ask directly", "Observe quietly", "Call a meeting"]
    return json.dumps(
        {
            "narrative": narrative,
            "visible_state_summary": "You know very little so far.",
            "gm_state": {
                "scene_summary": "SECRET-SCENE-SUMMARY",
                "actors": [
                    {
                        "name": "Morgan",
                        "status": "at their desk",
                        "intent": "deflect blame",
                        "reasoning": "SECRET-REASONING",
                    }
                ],
                "hidden_facts": ["SECRET-FACT"],
                "goal_progress": "not started",
            },
            "options": [{"text": text, "reasoning": f"Because: {text}"} for text in options],
            "is_final": is_final,
            "epilogue": epilogue,
        }
    )


def validation_json(
    valid=True, reason="", option_text="Do the suggested thing", reasoning="It might work."
):
    """A valid ActionValidation payload for the suggest-action flow."""
    if not valid:
        option_text, reasoning = "", ""
        reason = reason or "Your character has no way to do that right now."
    return json.dumps(
        {"valid": valid, "reason": reason, "option_text": option_text, "reasoning": reasoning}
    )


def analysis_json():
    """A valid PlaythroughAnalysis payload for the post-game analysis flow."""
    return json.dumps(
        {
            "outcome": "You kept Morgan on the team and shipped on time.",
            "overall": "You read the situation early and prioritized the relationship.",
            "decisions": [
                {
                    "turn_index": 0,
                    "choice": "Ask directly",
                    "commentary": "Direct honesty worked because Morgan already had an offer.",
                    "better_alternative": "",
                }
            ],
            "strengths": ["You addressed the problem instead of avoiding it."],
            "improvements": ["Probe for hidden incentives before making commitments."],
        }
    )


def draft_json():
    return json.dumps(
        {
            "title": "Burnout on the Team",
            "premise": "Your top engineer is burning out mid-project.",
            "setting": "A mid-size startup, two weeks before a launch.",
            "tone": "corporate-realistic",
            "goal": "Keep the engineer and ship the project.",
            "gm_notes": "The engineer already has an offer elsewhere.",
            "roles": [
                {
                    "name": "Engineering Manager",
                    "description": "Newly promoted.",
                    "private_info": "You suspect nothing yet.",
                }
            ],
            "npcs": [
                {
                    "name": "Morgan",
                    "description": "Senior engineer.",
                    "hidden_agenda": "Has a competing offer.",
                }
            ],
        }
    )


class FakeChat:
    """Scripted replacement for llm._chat; returns queued responses in order,
    repeating the last one when the queue runs out."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls: list[list[dict]] = []

    async def __call__(self, messages):
        self.calls.append(messages)
        if len(self.responses) > 1:
            return self.responses.pop(0)
        return self.responses[0]


@pytest.fixture
def fake_chat(monkeypatch):
    def install(*responses):
        fake = FakeChat(responses)
        monkeypatch.setattr("app.services.llm._chat", fake)
        return fake

    return install


SCENARIO_BODY = {
    "title": "Burnout on the Team",
    "premise": "Your top engineer is burning out.",
    "setting": "A startup.",
    "tone": "corporate-realistic",
    "goal": "Keep them and ship.",
    "gm_notes": "They have an offer elsewhere.",
    "roles": [
        {"name": "Engineering Manager", "description": "New EM.", "private_info": "None yet."}
    ],
    "npcs": [{"name": "Morgan", "description": "Senior eng.", "hidden_agenda": "Competing offer."}],
}
