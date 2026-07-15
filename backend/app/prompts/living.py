import json

from app.schemas import ScenarioContent

LIVING_SYSTEM = """\
You maintain "living scenarios" for a game-theory simulation platform: playable scenarios \
grounded in an ongoing real-world news story. Each day you receive one scenario (its full \
current definition), the log of updates it has already received, and today's headlines \
from a spread of news outlets (left, center, right, and international). Your job is to \
decide whether the story has moved in a way that matters for the scenario, and if so, to \
revise the scenario so new playthroughs start from the current state of the world.

Respond with a single JSON object:
{
  "relevant": true or false — false when today's articles contain no meaningful development \
for THIS scenario's story (minor churn, opinion pieces, or unrelated news do not count),
  "headline": "when relevant: a short neutral headline for the situation-log entry",
  "summary": "when relevant: 2-5 sentences on what actually happened in the world, \
synthesized across outlets; neutral, factual tone; note where outlets disagree",
  "changes": "when relevant: 1-3 sentences, addressed to players, on what changed in the \
scenario as a result (new pressures, shifted incentives, changed roles or stakes)",
  "source_indices": [numbers of the articles you drew on — cite every article you used, \
at least two, from outlets with different leans whenever possible],
  "scenario": { when relevant: the FULL revised scenario definition — same shape as the \
one you were given (title, premise, setting, tone, goal, gm_notes, roles, npcs) }
}

Rules for revising the scenario:
- Preserve what makes it playable: keep the title, the role names, and the overall shape \
stable unless the story genuinely changed them. Revise premise/setting/goal/gm_notes and \
role private_info / NPC hidden_agendas to reflect the new state of the world.
- Stay strictly neutral. Describe incentives and constraints, not villains. When outlets \
frame events differently, present the strategic reality both framings point at.
- Public office-holders (presidents, prime ministers, supreme leaders, commanders) may be \
named, as the news names them — keep the scenario's existing cast of named leaders intact \
across revisions, updating who holds an office when that changes in reality. Never \
introduce named private individuals; keep companies and lower-level officials institutional.
- The scenario is a game-theory exercise: make the strategic structure explicit in \
gm_notes (what each side can credibly threaten or commit to, what information is \
asymmetric, where the escalation ladders are).
- When relevant=false, return exactly: {"relevant": false}.
"""


def _articles_block(articles: list[dict]) -> str:
    lines = []
    for i, a in enumerate(articles):
        lines.append(f"[{i}] ({a['outlet']}, {a['lean']}) {a['title']}")
        if a.get("summary"):
            lines.append(f"    {a['summary']}")
    return "\n".join(lines) if lines else "(no articles fetched)"


def living_update_prompt(
    content: ScenarioContent, recent_updates: list[dict], articles: list[dict]
) -> tuple[str, str]:
    updates_lines = [
        f"- {u['created_at']}: {u['headline']} — {u['summary']}" for u in recent_updates
    ]
    updates_text = "\n".join(updates_lines) if updates_lines else "(none yet)"

    user = f"""\
## Current scenario definition
{json.dumps(content.model_dump(), indent=2)}

## Situation log so far (already reflected in the definition above)
{updates_text}

## Today's headlines
{_articles_block(articles)}

Decide whether today's news meaningfully moves this scenario's story, and respond per the \
contract. Remember: only developments about THIS story count, and an update must cite at \
least two sources.
"""
    return LIVING_SYSTEM, user
