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


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("anon_sessions.id"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
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
