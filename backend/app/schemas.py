import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Scenario authoring
# ---------------------------------------------------------------------------


class Role(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    # shown only to the player who picks this role (and the GM)
    private_info: str = ""


class NPC(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    # GM-only
    hidden_agenda: str = ""


class ScenarioIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    premise: str = ""
    setting: str = ""
    tone: str = Field(default="", max_length=200)
    goal: str = ""
    gm_notes: str = ""
    roles: list[Role] = Field(default_factory=list, min_length=1)
    npcs: list[NPC] = Field(default_factory=list)


class ScenarioOut(ScenarioIn):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DraftRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=2000)


class ScenarioDraft(BaseModel):
    """LLM output schema for the AI-expand builder."""

    title: str = Field(min_length=1, max_length=200)
    premise: str = Field(min_length=1)
    setting: str = ""
    tone: str = ""
    goal: str = Field(min_length=1)
    gm_notes: str = ""
    roles: list[Role] = Field(min_length=1, max_length=6)
    npcs: list[NPC] = Field(default_factory=list, max_length=10)


# ---------------------------------------------------------------------------
# Play: GM state and turn generation (LLM output, strictly validated)
# ---------------------------------------------------------------------------


class ActorState(BaseModel):
    name: str
    status: str = ""
    intent: str = ""
    # private reasoning — never shown during play, visible in review
    reasoning: str = ""


class GMState(BaseModel):
    scene_summary: str = Field(min_length=1)
    actors: list[ActorState] = Field(default_factory=list)
    hidden_facts: list[str] = Field(default_factory=list)
    goal_progress: str = ""


class OptionGeneration(BaseModel):
    text: str
    # player-safe rationale for considering this action — no secrets
    reasoning: str = ""


class TurnGeneration(BaseModel):
    """What the LLM must produce for every turn (initial and after a choice)."""

    narrative: str = Field(min_length=1)
    visible_state_summary: str = ""
    gm_state: GMState
    options: list[OptionGeneration] = Field(default_factory=list)
    is_final: bool = False
    epilogue: str = ""

    @model_validator(mode="after")
    def check_options(self) -> "TurnGeneration":
        if self.is_final:
            if not self.epilogue.strip():
                raise ValueError("a final turn must include an epilogue")
            return self
        if not 3 <= len(self.options) <= 5:
            raise ValueError(f"expected 3-5 options, got {len(self.options)}")
        cleaned = [o.text.strip() for o in self.options]
        if any(not o for o in cleaned):
            raise ValueError("option texts must be non-empty")
        if len({o.lower() for o in cleaned}) != len(cleaned):
            raise ValueError("options must be distinct")
        return self


class ActionValidation(BaseModel):
    """LLM output schema for judging a player-suggested action."""

    valid: bool
    # player-safe explanation; shown to the player when the action is rejected
    reason: str = ""
    # cleaned-up, in-character phrasing of the action (required when valid)
    option_text: str = ""
    # player-safe rationale, same as generated options carry
    reasoning: str = ""

    @model_validator(mode="after")
    def check_fields(self) -> "ActionValidation":
        if self.valid and not self.option_text.strip():
            raise ValueError("a valid action must include option_text")
        if not self.valid and not self.reason.strip():
            raise ValueError("a rejected action must include a reason")
        return self


# ---------------------------------------------------------------------------
# Play: API views
# ---------------------------------------------------------------------------


class Option(BaseModel):
    id: str
    text: str
    reasoning: str = ""
    # true when the option came from a player suggestion rather than the GM
    custom: bool = False


class PlayerView(BaseModel):
    """The only turn payload play endpoints may return — gm_state never leaks here."""

    narrative: str
    visible_state_summary: str = ""
    options: list[Option] = Field(default_factory=list)
    epilogue: str = ""


class TurnOut(BaseModel):
    index: int
    player_view: PlayerView
    chosen_option_id: str | None = None
    is_final: bool = False
    created_at: datetime


class PlaythroughOut(BaseModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    role_name: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    turn_count: int = 0

    model_config = {"from_attributes": True}


class PlaythroughDetail(BaseModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    scenario_title: str
    role_name: str
    status: str
    turns: list[TurnOut]


class StartPlaythroughRequest(BaseModel):
    role_name: str = Field(min_length=1, max_length=200)


class ChoiceRequest(BaseModel):
    option_id: str = Field(min_length=1, max_length=50)


class SuggestActionRequest(BaseModel):
    text: str = Field(min_length=3, max_length=300)


class SuggestActionResult(BaseModel):
    accepted: bool
    # when rejected, the player-safe explanation of why
    reason: str = ""
    turn: TurnOut


# ---------------------------------------------------------------------------
# Review: full transparency after the fact
# ---------------------------------------------------------------------------


class ReviewTurn(BaseModel):
    index: int
    player_view: PlayerView
    gm_state: GMState
    chosen_option_id: str | None = None
    is_final: bool = False
    created_at: datetime


class PlaythroughReview(BaseModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    scenario_title: str
    role_name: str
    status: str
    turns: list[ReviewTurn]
