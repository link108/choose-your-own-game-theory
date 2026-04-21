import type {
  ScenarioState,
  ActorState,
  ActorResponseData,
  StateChange,
  Choice,
} from "@/lib/types";
import type {
  EffectDefinition,
  ScenarioPackage,
} from "@/lib/scenario-dsl";
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
    return generateResponse(state, npc, player, playerChoice, dominantTrait);
  });
}

/**
 * Generate stub choices for the next turn.
 * Choices vary based on turn number, relationships, and resource levels.
 */
export function getStubChoices(state: ScenarioState): Choice[] {
  const player = getPlayerActor(state);
  if (!player) return [];

  const npcs = getNonPlayerActors(state);
  const choices: Choice[] = [];
  const turn = state.turn;

  // Rotate which NPC is the primary target based on turn
  const primaryNpc = npcs[turn % npcs.length];
  const secondaryNpc = npcs.length > 1 ? npcs[(turn + 1) % npcs.length] : null;

  // Check resource levels for context-sensitive choices
  const lowResources = player.resources.filter(
    (r) => r.value < r.maxValue * 0.3
  );
  const highResources = player.resources.filter(
    (r) => r.value > r.maxValue * 0.6
  );

  // Check relationship state
  const relationships = npcs.map((npc) => {
    const rel = state.relationships.find(
      (r) => r.fromActorId === player.id && r.toActorId === npc.id
    );
    return { npc, rel };
  });
  const allies = relationships.filter(
    (r) => r.rel && (r.rel.type === "ally" || r.rel.strength > 65)
  );
  const rivals = relationships.filter(
    (r) => r.rel && (r.rel.type === "rival" || r.rel.strength < 30)
  );

  // --- Generate context-sensitive choices ---

  // Diplomatic option (varies target by turn)
  if (primaryNpc) {
    const rel = state.relationships.find(
      (r) => r.fromActorId === player.id && r.toActorId === primaryNpc.id
    );
    if (rel && rel.strength < 40) {
      choices.push({
        id: `reconcile_${primaryNpc.id}_t${turn}`,
        text: `Seek reconciliation with ${primaryNpc.name}`,
        description: `Your relationship is strained (${rel.strength}/100). Attempt to mend ties before it's too late.`,
      });
    } else {
      choices.push({
        id: `negotiate_${primaryNpc.id}_t${turn}`,
        text: `Negotiate with ${primaryNpc.name}`,
        description: `Open diplomatic talks with ${primaryNpc.name} to explore opportunities.`,
      });
    }
  }

  // Resource-driven choices
  if (lowResources.length > 0 && secondaryNpc) {
    const needed = lowResources[0];
    choices.push({
      id: `request_aid_${secondaryNpc.id}_t${turn}`,
      text: `Request ${needed.name.toLowerCase()} from ${secondaryNpc.name}`,
      description: `Your ${needed.name.toLowerCase()} is running low (${needed.value}). Ask ${secondaryNpc.name} for help.`,
    });
  } else if (highResources.length > 0 && primaryNpc) {
    const surplus = highResources[0];
    choices.push({
      id: `trade_${primaryNpc.id}_t${turn}`,
      text: `Offer ${surplus.name.toLowerCase()} to ${primaryNpc.name}`,
      description: `You have surplus ${surplus.name.toLowerCase()} (${surplus.value}). Trade it for something you need.`,
    });
  }

  // Strategic choice based on turn parity
  if (turn % 3 === 0) {
    choices.push({
      id: `fortify_t${turn}`,
      text: "Strengthen your defenses",
      description: "Focus inward — shore up resources and prepare for what's coming.",
    });
  } else if (turn % 3 === 1) {
    choices.push({
      id: `gather_intel_t${turn}`,
      text: "Send out scouts",
      description: "Gather intelligence on what the other actors are planning.",
    });
  } else {
    choices.push({
      id: `rally_support_t${turn}`,
      text: "Rally your people",
      description: "Build morale and consolidate your internal position.",
    });
  }

  // Aggressive option if there's a rival
  if (rivals.length > 0) {
    const rival = rivals[turn % rivals.length];
    choices.push({
      id: `pressure_${rival.npc.id}_t${turn}`,
      text: `Challenge ${rival.npc.name}`,
      description: `${rival.npc.name} has been a thorn in your side. Time to push back.`,
    });
  }

  // Alliance option if there's a potential ally
  if (allies.length > 0 && secondaryNpc) {
    const ally = allies[0];
    choices.push({
      id: `deepen_alliance_${ally.npc.id}_t${turn}`,
      text: `Deepen ties with ${ally.npc.name}`,
      description: `Your relationship with ${ally.npc.name} is strong. Propose a formal agreement.`,
    });
  } else if (npcs.length > 1) {
    // Offer to play actors against each other
    choices.push({
      id: `play_sides_t${turn}`,
      text: "Play both sides",
      description: "Carefully maneuver between the other actors, leveraging their rivalry.",
    });
  }

  // World-variable driven choice
  const countdown = state.worldVariables.find(
    (v) => v.name.toLowerCase().includes("turns until") || v.name.toLowerCase().includes("countdown")
  );
  if (countdown) {
    const val = parseInt(countdown.value);
    if (!isNaN(val) && val <= 3 && val > 0) {
      choices.push({
        id: `prepare_endgame_t${turn}`,
        text: "Prepare for the coming crisis",
        description: `Only ${val} turns remain before ${countdown.name.replace("Turns Until ", "").toLowerCase()}. Make final preparations.`,
      });
    }
  }

  return choices.slice(0, 5);
}

export function getStubScenarioChoices(
  state: ScenarioState,
  scenarioPackage: ScenarioPackage,
  previousChoices?: Choice[]
): Choice[] {
  const player = getPlayerActor(state);
  if (!player) return [];

  const maxChoices = scenarioPackage.choicePolicy.maxChoices;
  const preferredEffects =
    scenarioPackage.choicePolicy.preferredEffectIds?.length
      ? scenarioPackage.choicePolicy.preferredEffectIds
          .map((id) =>
            scenarioPackage.effectDefinitions.find((effect) => effect.id === id)
          )
          .filter((effect): effect is EffectDefinition => Boolean(effect))
      : scenarioPackage.effectDefinitions;

  const previousTexts = new Set(previousChoices?.map((choice) => choice.text) ?? []);
  const choices: Choice[] = [];

  for (const effect of preferredEffects) {
    const bindings = chooseBindingsForEffect(state, effect, player.id);
    if (!bindings) continue;

    const choice = buildChoiceFromEffect(effect, bindings, state);
    if (!choice) continue;
    if (previousTexts.has(choice.text)) continue;
    if (choices.some((item) => item.text === choice.text)) continue;

    choices.push(choice);
    if (choices.length >= maxChoices) break;
  }

  if (choices.length < scenarioPackage.choicePolicy.minChoices) {
    for (const fallback of getStubChoices(state)) {
      if (previousTexts.has(fallback.text)) continue;
      if (choices.some((item) => item.text === fallback.text)) continue;
      choices.push(fallback);
      if (choices.length >= maxChoices) break;
    }
  }

  return choices.slice(0, maxChoices);
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
  const traits = Array.isArray(actor.traits)
    ? actor.traits.map((t: string) => t.toLowerCase())
    : [];

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
  const isNegotiation = choiceText.includes("negotiate") || choiceText.includes("trade") || choiceText.includes("reconcil") || choiceText.includes("request") || choiceText.includes("offer");
  const isAggressive = choiceText.includes("pressure") || choiceText.includes("attack") || choiceText.includes("challenge");

  const changes: StateChange[] = [];
  let action: string;
  let reasoning: string;

  switch (trait) {
    case "aggressive": {
      if (isNegotiation) {
        action = `${npc.name} listens skeptically to your proposal, demanding better terms.`;
        reasoning = "Views negotiation as a sign of weakness but will hear the offer.";
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

function chooseBindingsForEffect(
  state: ScenarioState,
  effect: EffectDefinition,
  playerActorId: string
): Record<string, string> | null {
  const bindings: Record<string, string> = {};
  const npcs = getNonPlayerActors(state);
  const visibleObjects = state.scenarioObjects?.filter(
    (object) => object.visibility !== "hidden"
  ) ?? [];

  for (const [name, parameter] of Object.entries(effect.parameters ?? {})) {
    if (parameter.type === "actor") {
      if (name === "actor" || name === "debtor") {
        bindings[name] = playerActorId;
        continue;
      }

      if (name === "partner" || name === "creditor") {
        const target = npcs[0];
        if (!target) return null;
        bindings[name] = target.id;
        continue;
      }

      const target =
        npcs.find((actor) => actor.id !== bindings.actor && actor.id !== playerActorId) ??
        npcs[0] ??
        state.actors.find((actor) => actor.id !== playerActorId);
      if (!target) return null;
      bindings[name] = target.id;
      continue;
    }

    if (parameter.type === "object") {
      const target = visibleObjects.find((object) =>
        parameter.objectType ? object.typeId === parameter.objectType : true
      );
      if (!target) return null;
      bindings[name] = target.id;
      continue;
    }

    if (parameter.type === "resource") {
      const preferredResource =
        state.actors
          .find((actor) => actor.id === bindings.actor || actor.id === playerActorId)
          ?.resources[0] ?? state.actors[0]?.resources[0];
      if (!preferredResource) return null;
      bindings[name] = preferredResource.id;
      continue;
    }

    if (parameter.type === "worldVariable") {
      const variable = state.worldVariables[0];
      if (!variable) return null;
      bindings[name] = variable.id;
      continue;
    }

    if (parameter.type === "relationship") {
      const relationship =
        state.relationships.find(
          (item) => item.fromActorId === playerActorId || item.toActorId === playerActorId
        ) ?? state.relationships[0];
      if (!relationship) return null;
      bindings[name] = relationship.id;
      continue;
    }
  }

  return bindings;
}

function buildChoiceFromEffect(
  effect: EffectDefinition,
  bindings: Record<string, string>,
  state: ScenarioState
): Choice | null {
  const resolvedNames = Object.fromEntries(
    Object.entries(bindings).map(([key, id]) => [key, lookupEntityLabel(state, id)])
  );

  const targetLabel =
    resolvedNames.location ??
    resolvedNames.partner ??
    resolvedNames.creditor ??
    resolvedNames.actor ??
    resolvedNames.debtor;

  const text = targetLabel
    ? `${effect.label} at ${targetLabel}`.replace(/\bat actor\b/i, "with")
    : effect.label;

  const idSuffix = Object.values(bindings)
    .join("_")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .toLowerCase();

  return {
    id: `${effect.id}_${idSuffix || "choice"}`.slice(0, 80),
    text,
    description: effect.description,
    source: "fallback",
    debugReasoning: targetLabel
      ? `${effect.label} is currently grounded by ${targetLabel}.`
      : `${effect.label} is currently a valid package-defined action.`,
    debugReasoningSource: "fallback",
    execution: {
      kind: "scenario_effect",
      invocation: {
        effectId: effect.id,
        intensity:
          effect.intensities.moderate != null
            ? "moderate"
            : effect.intensities.minor != null
              ? "minor"
              : "major",
        bindings,
      },
    },
  };
}

function lookupEntityLabel(state: ScenarioState, id: string): string {
  const actor = state.actors.find((item) => item.id === id);
  if (actor) return actor.name;

  const object = state.scenarioObjects?.find((item) => item.id === id);
  if (object) return object.name;

  const resource = state.actors.flatMap((actorState) => actorState.resources).find(
    (item) => item.id === id
  );
  if (resource) return resource.name;

  const variable = state.worldVariables.find((item) => item.id === id);
  if (variable) return variable.name;

  const relationship = state.relationships.find((item) => item.id === id);
  if (relationship) return relationship.type;

  return id;
}

function findRelationship(state: ScenarioState, fromId: string, toId: string) {
  return state.relationships.find(
    (r) => r.fromActorId === fromId && r.toActorId === toId
  );
}
