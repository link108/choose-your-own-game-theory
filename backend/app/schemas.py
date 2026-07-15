import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class Credentials(BaseModel):
    email: EmailStr
    # bcrypt ignores bytes past 72, so don't accept them
    password: str = Field(min_length=8, max_length=72)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class GuestAuthResponse(BaseModel):
    """A bearer token for an account-less session (native-app guest mode)."""

    token: str


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
    category: str = Field(default="", max_length=100)
    premise: str = ""
    setting: str = ""
    tone: str = Field(default="", max_length=200)
    goal: str = ""
    gm_notes: str = ""
    roles: list[Role] = Field(default_factory=list, min_length=1)
    npcs: list[NPC] = Field(default_factory=list)


class ScenarioOut(ScenarioIn):
    id: uuid.UUID
    is_library: bool = False
    is_living: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScenarioContent(BaseModel):
    """The play-relevant scenario fields, as snapshotted into a playthrough.

    roles/npcs stay plain dicts so prompt code treats live rows and snapshots alike.
    """

    title: str
    premise: str = ""
    setting: str = ""
    tone: str = ""
    goal: str = ""
    gm_notes: str = ""
    roles: list[dict] = Field(default_factory=list)
    npcs: list[dict] = Field(default_factory=list)

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
# Analysis: post-game coaching (LLM output, strictly validated)
# ---------------------------------------------------------------------------


class DecisionAssessment(BaseModel):
    turn_index: int
    # the option the player picked, quoted back for context
    choice: str = Field(min_length=1)
    # what the choice actually set in motion, with the benefit of the hidden state
    commentary: str = Field(min_length=1)
    # a concretely better move, or "" when the choice was already strong
    better_alternative: str = ""


class PlaythroughAnalysis(BaseModel):
    """LLM output schema for the post-game analysis of the player's choices."""

    outcome: str = Field(min_length=1)
    overall: str = Field(min_length=1)
    decisions: list[DecisionAssessment] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_content(self) -> "PlaythroughAnalysis":
        if not self.strengths and not self.improvements:
            raise ValueError("analysis must include at least one strength or improvement")
        return self


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
    # present once the player has requested a post-game analysis
    analysis: PlaythroughAnalysis | None = None


# ---------------------------------------------------------------------------
# Living scenarios: news-driven updates (LLM output + API views)
# ---------------------------------------------------------------------------


class Source(BaseModel):
    outlet: str
    lean: str = ""  # left | center | right | international
    title: str = ""
    url: str = ""


class LivingUpdateDraft(BaseModel):
    """LLM output schema for the daily living-scenario update pass."""

    # false when the day's news contains no development relevant to this scenario
    relevant: bool
    headline: str = Field(default="", max_length=300)
    summary: str = ""
    changes: str = ""
    # indices into the numbered article list given in the prompt
    source_indices: list[int] = Field(default_factory=list)
    scenario: ScenarioContent | None = None

    @model_validator(mode="after")
    def check_relevant_fields(self) -> "LivingUpdateDraft":
        if not self.relevant:
            return self
        if not self.headline.strip() or not self.summary.strip() or not self.changes.strip():
            raise ValueError("a relevant update needs headline, summary, and changes")
        if self.scenario is None:
            raise ValueError("a relevant update must include the full revised scenario")
        if len(self.source_indices) < 2:
            raise ValueError("a relevant update must cite at least two sources")
        return self


class ScenarioUpdateOut(BaseModel):
    """Published situation-log entry, visible to players."""

    id: uuid.UUID
    headline: str
    summary: str
    changes: str
    sources: list[Source]
    created_at: datetime

    model_config = {"from_attributes": True}


class ScenarioUpdateAdminOut(ScenarioUpdateOut):
    """Draft/any update as the admin review UI sees it: proposed vs current content."""

    scenario_id: uuid.UUID
    scenario_title: str
    status: str
    proposed: ScenarioContent
    current: ScenarioContent
    reviewed_at: datetime | None = None


class LivingRunResult(BaseModel):
    scenarios_checked: int
    drafts_created: int
    skipped_pending_review: int
    articles_fetched: int
    errors: list[str] = Field(default_factory=list)
