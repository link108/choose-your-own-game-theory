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
  "options": ["3 to 5 distinct actions the player could plausibly take next"],
  "is_final": false,
  "epilogue": ""
}

Rules:
- The narrative must strictly respect information hiding: the player sees only what their \
character would see. All secret material belongs in gm_state.
- Options must be meaningfully different from each other, concrete, and in-character. \
Include at least one safe/conventional option and at least one bold or risky option.
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
