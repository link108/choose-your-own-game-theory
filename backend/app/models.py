import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# JSONB on postgres, plain JSON elsewhere (sqlite in tests)
JsonCol = JSON().with_variant(JSONB(), "postgresql")


class AnonSession(Base):
    __tablename__ = "anon_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class User(Base):
    """A registered account. Every user permanently owns one anon_sessions row, so all
    ownership FKs (scenarios, playthroughs) work unchanged and content follows the user
    across devices; guests keep using bare anon sessions."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user|admin
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("anon_sessions.id"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("anon_sessions.id"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    # library grouping, e.g. "Negotiation & Deals"; free-form, "" for uncategorized
    category: Mapped[str] = mapped_column(String(100), default="")
    # seeded library scenarios: readable/playable by every session, editable by none but owner
    is_library: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # living scenarios track a real-world news story and receive reviewed updates over time
    is_living: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    premise: Mapped[str] = mapped_column(Text, default="")
    setting: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str] = mapped_column(String(200), default="")
    goal: Mapped[str] = mapped_column(Text, default="")
    gm_notes: Mapped[str] = mapped_column(Text, default="")
    # list[{name, description, private_info}]
    roles: Mapped[list] = mapped_column(JsonCol, default=list)
    # list[{name, description, hidden_agenda}]
    npcs: Mapped[list] = mapped_column(JsonCol, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Playthrough(Base):
    __tablename__ = "playthroughs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("scenarios.id", ondelete="CASCADE"), index=True
    )
    owner_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("anon_sessions.id"), index=True
    )
    role_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|completed|abandoned
    # scenario content frozen at start, so living-scenario updates never shift a game in
    # progress; None on pre-snapshot rows, which fall back to the live scenario
    scenario_snapshot: Mapped[dict | None] = mapped_column(JsonCol, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # post-game analysis of the player's choices (PlaythroughAnalysis), generated on demand
    analysis: Mapped[dict | None] = mapped_column(JsonCol, nullable=True)


class Turn(Base):
    __tablename__ = "turns"
    __table_args__ = (
        UniqueConstraint("playthrough_id", "index", name="uq_turn_playthrough_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    playthrough_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("playthroughs.id", ondelete="CASCADE"), index=True
    )
    index: Mapped[int] = mapped_column(Integer)
    # {narrative, visible_state_summary, options: [{id, text}], epilogue?}
    player_view: Mapped[dict] = mapped_column(JsonCol)
    # full hidden state: scene summary, actor intents/reasoning, hidden facts, goal progress
    gm_state: Mapped[dict] = mapped_column(JsonCol)
    chosen_option_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)
    # bumped on "regenerate" so the LLM cache key changes; prior generations stay in llm_calls
    regen_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ScenarioUpdate(Base):
    """A news-driven revision of a living scenario, drafted by the daily pipeline and
    applied to the scenario only when an admin approves it."""

    __tablename__ = "scenario_updates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("scenarios.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default="draft", index=True
    )  # draft|published|rejected
    headline: Mapped[str] = mapped_column(String(300))
    # what happened in the world, synthesized neutrally from the sources
    summary: Mapped[str] = mapped_column(Text, default="")
    # what changed in the scenario as a result (player-facing changelog entry)
    changes: Mapped[str] = mapped_column(Text, default="")
    # list[{outlet, lean, title, url}] — the articles the update was synthesized from
    sources: Mapped[list] = mapped_column(JsonCol, default=list)
    # full proposed scenario content (ScenarioContent shape); applied on approval
    proposed: Mapped[dict] = mapped_column(JsonCol, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class LLMCall(Base):
    __tablename__ = "llm_calls"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    cache_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(50))
    request: Mapped[dict] = mapped_column(JsonCol)
    response: Mapped[dict] = mapped_column(JsonCol)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
