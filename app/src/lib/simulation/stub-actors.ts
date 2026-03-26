import type {
  ScenarioState,
  ActorState,
  ActorResponseData,
  StateChange,
  Choice,
} from "@/lib/types";
import { getPlayerActor, getNonPlayerActors } from "./state";

/**
 * Generate deterministic actor responses based on traits.
 * This is the pre-LLM stub — just enough to test the pipeline.
 */
export function getStubActorResponses(
  state: ScenarioState,
  playerChoice: { id: string; text: string }
): ActorResponseData[] {
  const npcs = getNonPlayerActors(state);
  const player = getPlayerActor(state);
  if (!player) return [];

  return npcs.map((npc) => {
    const dominantTrait = getDominantTrait(npc);
    const response = generateResponse(state, npc, player, playerChoice, dominantTrait);
    return response;
  });
}

/**
 * Generate stub choices for the next turn.
 */
export function getStubChoices(state: ScenarioState): Choice[] {
  const player = getPlayerActor(state);
  if (!player) return [];

  const npcs = getNonPlayerActors(state);
  const choices: Choice[] = [];

  // Always offer a diplomatic option
  if (npcs.length > 0) {
    const target = npcs[0];
    choices.push({
      id: `negotiate_${target.id}`,
      text: `Negotiate with ${target.name}`,
      description: `Open diplomatic talks with ${target.name} to find common ground.`,
    });
  }

  // Offer a trade if player has resources
  const highestResource = player.resources.reduce(
    (max, r) => (r.value > max.value ? r : max),
    player.resources[0]
  );
  if (highestResource && highestResource.value > 0 && npcs.length > 0) {
    choices.push({
      id: `trade_${npcs[0].id}`,
      text: `Propose trade with ${npcs[0].name}`,
      description: `Offer some ${highestResource.name.toLowerCase()} in exchange for something you need.`,
    });
  }

  // Offer a defensive option
  choices.push({
    id: "fortify",
    text: "Fortify your position",
    description: "Focus on building defenses and securing your current resources.",
  });

  // Offer an aggressive option if there's a rival
  const rival = npcs.find((npc) => {
    const rel = state.relationships.find(
      (r) => r.fromActorId === player.id && r.toActorId === npc.id
    );
    return rel?.type === "rival";
  });
  if (rival) {
    choices.push({
      id: `pressure_${rival.id}`,
      text: `Pressure ${rival.name}`,
      description: `Use your position to apply pressure on ${rival.name} and gain an advantage.`,
    });
  }

  // Offer a gather intel option
  if (npcs.length > 1) {
    choices.push({
      id: "gather_intel",
      text: "Gather intelligence",
      description: "Send scouts to learn about other actors' positions and intentions.",
    });
  }

  return choices.slice(0, 5); // Max 5 choices
}

/**
 * Generate an initial narrative and choices for turn 0.
 */
export function getStubInitialPage(state: ScenarioState) {
  const player = getPlayerActor(state);
  const npcs = getNonPlayerActors(state);

  const title = "The Stage Is Set";

  const actorIntros = npcs
    .map((npc) => {
      const relToPlayer = state.relationships.find(
        (r) => r.fromActorId === npc.id && r.toActorId === player?.id
      );
      const stance = relToPlayer
        ? `Their stance toward you: ${relToPlayer.type.replace("_", " ")}.`
        : "";
      return `**${npc.name}** — ${npc.description} ${stance}`;
    })
    .join("\n\n");

  const worldVars = state.worldVariables
    .map((v) => `- ${v.name}: ${v.value}`)
    .join("\n");

  const narrative = [
    `You are **${player?.name}**. ${player?.description}`,
    "",
    "The key players in this situation:",
    "",
    actorIntros,
    "",
    worldVars ? `Current conditions:\n${worldVars}` : "",
    "",
    "The time for action is now. What will you do?",
  ]
    .filter(Boolean)
    .join("\n");

  const choices = getStubChoices(state);

  return { title, narrative, choices };
}

// --- Internal helpers ---

type DominantTrait = "aggressive" | "diplomatic" | "cautious" | "neutral";

function getDominantTrait(actor: ActorState): DominantTrait {
  const traits = actor.traits.map((t) => t.toLowerCase());

  if (
    traits.includes("aggressive") ||
    traits.includes("intimidating") ||
    traits.includes("proud")
  ) {
    return "aggressive";
  }
  if (
    traits.includes("diplomatic") ||
    traits.includes("cunning") ||
    traits.includes("patient")
  ) {
    return "diplomatic";
  }
  if (
    traits.includes("cautious") ||
    traits.includes("defensive") ||
    traits.includes("conservative")
  ) {
    return "cautious";
  }
  return "neutral";
}

function generateResponse(
  state: ScenarioState,
  npc: ActorState,
  player: ActorState,
  playerChoice: { id: string; text: string },
  trait: DominantTrait
): ActorResponseData {
  const choiceText = playerChoice.text.toLowerCase();
  const isNegotiation = choiceText.includes("negotiate") || choiceText.includes("trade");
  const isAggressive = choiceText.includes("pressure") || choiceText.includes("attack");


  const changes: StateChange[] = [];
  let action: string;
  let reasoning: string;

  switch (trait) {
    case "aggressive": {
      if (isNegotiation) {
        action = `${npc.name} listens skeptically to your proposal, demanding better terms.`;
        reasoning = "Views negotiation as a sign of weakness but will hear the offer.";
        // Slight relationship improvement
        const rel = findRelationship(state, npc.id, player.id);
        if (rel) {
          changes.push({
            type: "relationship",
            target: npc.name,
            field: "strength",
            oldValue: rel.strength,
            newValue: Math.min(100, rel.strength + 3),
            reason: "Grudging respect for diplomatic attempt",
          });
        }
      } else if (isAggressive) {
        action = `${npc.name} responds to your aggression by mobilizing forces.`;
        reasoning = "Aggressive posturing demands a show of strength in return.";
        // Both sides lose resources
        const npcTroops = npc.resources.find((r) => r.name === "Troops");
        if (npcTroops) {
          changes.push({
            type: "resource",
            target: npc.name,
            field: "Troops",
            oldValue: npcTroops.value,
            newValue: npcTroops.value - 10,
            reason: "Mobilization costs",
          });
        }
        const playerTroops = player.resources.find((r) => r.name === "Troops");
        if (playerTroops) {
          changes.push({
            type: "resource",
            target: player.name,
            field: "Troops",
            oldValue: playerTroops.value,
            newValue: playerTroops.value - 5,
            reason: "Skirmish losses",
          });
        }
      } else {
        action = `${npc.name} sees your defensive posture as an opportunity and probes your borders.`;
        reasoning = "Perceives passivity as weakness to exploit.";
      }
      break;
    }
    case "diplomatic": {
      if (isNegotiation) {
        action = `${npc.name} eagerly engages in discussions, proposing a mutually beneficial arrangement.`;
        reasoning = "Sees this as an opportunity to strengthen ties and gain influence.";
        const rel = findRelationship(state, npc.id, player.id);
        if (rel) {
          changes.push({
            type: "relationship",
            target: npc.name,
            field: "strength",
            oldValue: rel.strength,
            newValue: Math.min(100, rel.strength + 8),
            reason: "Productive diplomatic engagement",
          });
        }
      } else if (isAggressive) {
        action = `${npc.name} calls for calm and proposes mediation through back channels.`;
        reasoning = "Escalation threatens the balance of power they rely on.";
      } else {
        action = `${npc.name} sends a diplomatic envoy with a proposal for cooperation.`;
        reasoning = "Always looking for opportunities to build alliances.";
        const rel = findRelationship(state, npc.id, player.id);
        if (rel) {
          changes.push({
            type: "relationship",
            target: npc.name,
            field: "strength",
            oldValue: rel.strength,
            newValue: Math.min(100, rel.strength + 5),
            reason: "Diplomatic overture",
          });
        }
      }
      break;
    }
    case "cautious": {
      action = `${npc.name} observes your actions carefully and takes no immediate action.`;
      reasoning = "Prefers to wait and see before committing to a course of action.";
      break;
    }
    default: {
      action = `${npc.name} acknowledges your action and responds cautiously.`;
      reasoning = "Taking a measured approach to the evolving situation.";
    }
  }

  return {
    actorId: npc.id,
    actorName: npc.name,
    action,
    reasoning,
    proposedChanges: changes,
  };
}

function findRelationship(state: ScenarioState, fromId: string, toId: string) {
  return state.relationships.find(
    (r) => r.fromActorId === fromId && r.toActorId === toId
  );
}
