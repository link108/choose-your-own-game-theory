import json

from app.models import Scenario

TURN_JSON_CONTRACT = """\
Respond with a single JSON object:
{
  "narrative": "second-person prose shown to the player; ONLY what their character can \
perceive or know — never reveal hidden agendas, other characters' secrets, or gm_notes",
  "visible_state_summary": "1-3 short sentences summarizing what the player currently knows",
  "gm_state": {
    "scene_summary": "omniscient running summary of the true situation, including secrets \
and everything that has happened so far; this is your memory between turns, keep it complete",
    "actors": [
      {
        "name": "character name (include every NPC and the player's character)",
        "status": "their current situation",
        "intent": "what they are trying to do next",
        "reasoning": "their private reasoning — why, based on what they know and want"
      }
    ],
    "hidden_facts": ["facts true in the world that the player does not (yet) know"],
    "goal_progress": "honest assessment of how close the player is to succeeding or failing"
  },
  "options": [
    {
      "text": "one of 3 to 5 distinct actions the player could plausibly take next",
      "reasoning": "1-2 sentences on why the character might consider this and what it \
could achieve or risk — strictly limited to what the player already knows, no secrets"
    }
  ],
  "is_final": false,
  "epilogue": ""
}

Rules:
- The narrative must strictly respect information hiding: the player sees only what their \
character would see. All secret material belongs in gm_state.
- Options must be meaningfully different from each other, concrete, and in-character. \
Include at least one safe/conventional option and at least one bold or risky option. \
Each option's `reasoning` is shown to the player on request, so it must never hint at \
hidden facts or agendas.
- NPCs act according to their hidden agendas and their `reasoning` — they are not props.
- When the scenario goal is conclusively achieved or failed, set is_final=true, set \
options=[], and write an "epilogue" that wraps up the story and honestly describes the outcome.
- Keep the simulation coherent: consequences must follow from established facts and the \
player's actual choices. Do not retcon.
"""

GM_SYSTEM = f"""\
You are the game master of a choose-your-own-adventure simulation. You control the world \
and every non-player character; the player controls exactly one character. You know \
everything (including hidden agendas and gm notes); the player knows only what their \
character has seen. You will be given the scenario definition and, on later turns, the \
full hidden game state you previously produced.

{TURN_JSON_CONTRACT}
"""


def scenario_brief(scenario: Scenario, role_name: str) -> str:
    """Full scenario definition as the GM sees it, marking which role the player took."""
    lines = [
        f"# Scenario: {scenario.title}",
        f"Tone: {scenario.tone}" if scenario.tone else "",
        f"\n## Premise\n{scenario.premise}",
        f"\n## Setting\n{scenario.setting}" if scenario.setting else "",
        f"\n## Goal (defines when the scenario ends)\n{scenario.goal}",
        f"\n## GM notes (hidden from player)\n{scenario.gm_notes}" if scenario.gm_notes else "",
        "\n## Roles",
    ]
    for role in scenario.roles:
        marker = " <-- PLAYED BY THE HUMAN PLAYER" if role.get("name") == role_name else ""
        lines.append(f"- {role.get('name', '')}{marker}: {role.get('description', '')}")
        if role.get("private_info"):
            lines.append(f"  private info (known only to this character): {role['private_info']}")
    if scenario.npcs:
        lines.append("\n## NPCs (you play all of them)")
        for npc in scenario.npcs:
            lines.append(f"- {npc.get('name', '')}: {npc.get('description', '')}")
            if npc.get("hidden_agenda"):
                lines.append(f"  hidden agenda: {npc['hidden_agenda']}")
    return "\n".join(line for line in lines if line)


def initial_turn_prompt(scenario: Scenario, role_name: str) -> tuple[str, str]:
    user = f"""\
{scenario_brief(scenario, role_name)}

The player has chosen to play as: {role_name}

Open the scenario. Set the scene from this character's perspective, establish the initial \
tension, initialize the full gm_state (every actor, hidden facts, goal_progress), and give \
the player their first 3-5 options.
"""
    return GM_SYSTEM, user


def resolve_turn_prompt(
    scenario: Scenario,
    role_name: str,
    gm_state: dict,
    history: list[dict],
    chosen_option: str,
) -> tuple[str, str]:
    history_lines = []
    for entry in history:
        history_lines.append(f"### Turn {entry['index']}\n{entry['narrative']}")
        if entry.get("chosen"):
            history_lines.append(f"Player chose: {entry['chosen']}")
    history_text = "\n".join(history_lines) if history_lines else "(none)"

    user = f"""\
{scenario_brief(scenario, role_name)}

## Current hidden game state (your memory — treat as ground truth)
{json.dumps(gm_state, indent=2)}

## Recent turns (player-visible narrative and choices)
{history_text}

## The player just chose
{chosen_option}

Resolve this choice. Determine the outcome (it may succeed, partially succeed, or fail — \
be honest and let NPCs pursue their agendas), advance every actor, update the full \
gm_state, narrate what the player perceives, and present the next 3-5 options. If the \
scenario goal is now conclusively achieved or failed, finish with is_final=true and an epilogue.
"""
    return GM_SYSTEM, user


ACTION_VALIDATOR_SYSTEM = """\
You are the game master of a choose-your-own-adventure simulation. The player has typed \
their own action for the current turn instead of picking one of the offered options. \
Judge whether it is a valid action for their character to ATTEMPT right now (attempting \
is enough — it does not have to succeed; you will resolve the outcome later).

Accept the action when the character could plausibly try it in the current scene given \
what has been established. Reject it when it:
- relies on knowledge, abilities, items, or people the character does not have
- dictates outcomes or other characters' reactions instead of describing an attempt \
("I convince Morgan to stay" — rewrite-worthy; "The board fires the CEO" — reject)
- is out of scope for the scenario, breaks the fiction, or addresses you out of character
- is incoherent or not an action at all

If the intent is reasonable but the phrasing dictates an outcome, accept it and rephrase \
it as an attempt in option_text.

Respond with a single JSON object:
{
  "valid": true or false,
  "reason": "when invalid: a short player-safe explanation of why (never reveal secrets, \
hidden agendas, or gm state); when valid: \\"\\"",
  "option_text": "when valid: the action as a concise second-person option, cleaned up and \
in-character; when invalid: \\"\\"",
  "reasoning": "when valid: 1-2 sentences on why the character might consider this and \
what it could achieve or risk — limited to what the player already knows, no secrets"
}
"""


ANALYST_SYSTEM = """\
You are a thoughtful post-game analyst for a choose-your-own-adventure simulation that just \
ended. You will be given the full scenario definition (including everything that was hidden \
from the player), the complete turn-by-turn transcript with the options offered and the \
option chosen each turn, the hidden game state as it evolved, and how it all ended. Your job \
is to give the player honest, useful feedback on their decisions so they play situations \
like this better in the future.

Respond with a single JSON object:
{
  "outcome": "2-3 sentences: how the playthrough ended and the direct causes",
  "overall": "a paragraph assessing how the player approached the scenario: their read of \
the situation, how they handled uncertainty and other characters, and how their choices \
compounded",
  "decisions": [
    {
      "turn_index": 0,
      "choice": "the option the player picked that turn, quoted or closely paraphrased",
      "commentary": "what this choice actually set in motion — use the hidden state freely \
(agendas, hidden facts) now that the game is over; note what the player could and could not \
have known at the time",
      "better_alternative": "a concretely better move for that turn, or \\"\\" if the \
choice was already strong"
    }
  ],
  "strengths": ["specific things the player did well, tied to actual moments"],
  "improvements": ["specific, actionable advice for future playthroughs or analogous \
real situations"]
}

Rules:
- Cover only the decisions that mattered — the pivotal 2-5 turns, not every turn.
- Be honest but fair: judge decisions by what the player knew at the time, then reveal \
what the hidden state meant for that choice. Do not punish reasonable choices that turned \
out badly, and do not praise reckless ones that got lucky.
- Ground every claim in the transcript or hidden state; never invent events.
- Address the player directly as "you".
- If the playthrough was abandoned rather than played to a conclusion, say so in the \
outcome and analyze the decisions made up to that point.
"""


def analysis_prompt(
    scenario: Scenario, role_name: str, status: str, turns: list
) -> tuple[str, str]:
    """Full-transparency transcript for the post-game analyst: player-visible narrative,
    options with the chosen one marked, and each turn's hidden facts and goal progress,
    plus the final gm_state as ground truth."""
    lines = []
    for turn in turns:
        lines.append(f"### Turn {turn.index}")
        lines.append(turn.player_view.get("narrative", ""))
        options = turn.player_view.get("options", [])
        if options:
            lines.append("Options offered:")
            for opt in options:
                marker = " <-- CHOSEN" if opt["id"] == turn.chosen_option_id else ""
                custom = " (player's own suggestion)" if opt.get("custom") else ""
                lines.append(f"- {opt['text']}{custom}{marker}")
        hidden_facts = turn.gm_state.get("hidden_facts", [])
        if hidden_facts:
            lines.append(f"Hidden facts at this point: {'; '.join(hidden_facts)}")
        if turn.gm_state.get("goal_progress"):
            lines.append(f"Goal progress (hidden): {turn.gm_state['goal_progress']}")
        epilogue = turn.player_view.get("epilogue", "")
        if turn.is_final and epilogue:
            lines.append(f"Epilogue: {epilogue}")
        lines.append("")

    user = f"""\
{scenario_brief(scenario, role_name)}

The player played as: {role_name}
The playthrough ended with status: {status}

## Full transcript (narrative, options, choices, and per-turn hidden state)
{chr(10).join(lines)}

## Final hidden game state (ground truth at the end)
{json.dumps(turns[-1].gm_state, indent=2)}

Analyze the player's choices.
"""
    return ANALYST_SYSTEM, user


def validate_action_prompt(
    scenario: Scenario,
    role_name: str,
    gm_state: dict,
    narrative: str,
    options: list[dict],
    action: str,
) -> tuple[str, str]:
    option_lines = "\n".join(f"- {o.get('text', '')}" for o in options) or "(none)"
    user = f"""\
{scenario_brief(scenario, role_name)}

## Current hidden game state (ground truth — use it to judge plausibility, never leak it)
{json.dumps(gm_state, indent=2)}

## Current scene (player-visible narrative)
{narrative}

## Options already offered
{option_lines}

## The player's suggested action
{action}

Judge this suggestion.
"""
    return ACTION_VALIDATOR_SYSTEM, user
