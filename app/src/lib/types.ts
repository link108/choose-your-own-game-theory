// Shared TypeScript types for the simulation engine
import type {
  ScenarioEffectInvocation,
  ScenarioObject,
  ScenarioObjectType,
} from "@/lib/scenario-dsl";

export interface ActorState {
  id: string;
  name: string;
  description: string;
  goals: string[];
  traits: string[];
  isPlayer: boolean;
  resources: ResourceState[];
}

export interface ResourceState {
  id: string;
  name: string;
  value: number;
  minValue: number;
  maxValue: number;
}

export interface RelationshipState {
  id: string;
  fromActorId: string;
  toActorId: string;
  type: string;
  strength: number;
  description: string | null;
}

export type WorldVariableKind =
  | "resource"   // bounded number, static (modified only by effects)
  | "countdown"  // number ≥ 0, decrements by step (default 1) each turn
  | "counter"    // number, increments by step (default 1) each turn
  | "flag"       // boolean, static
  | "text";      // string, static

export interface WorldVariableConfig {
  step?: number; // for countdown/counter, defaults to 1
}

export interface WorldVariableState {
  id: string;
  name: string;
  value: string;
  kind: WorldVariableKind;
  minValue: string | null;
  maxValue: string | null;
  config?: WorldVariableConfig | null;
}

export interface GameEvent {
  id: string;
  turn: number;
  type: string;
  description: string;
  involvedActors: string[];
}

export interface ScenarioState {
  scenarioId: string;
  sessionId: string;
  turn: number;
  actors: ActorState[];
  relationships: RelationshipState[];
  worldVariables: WorldVariableState[];
  scenarioObjectTypes?: ScenarioObjectType[];
  scenarioObjects?: ScenarioObject[];
  eventHistory: GameEvent[];
}

export interface StateChange {
  type: "resource" | "relationship" | "worldVariable" | "actorStatus" | "scenarioObject";
  target: string;
  field: string;
  oldValue: number | string;
  newValue: number | string;
  reason: string;
}

export interface VisibleStateChange {
  kind: "numeric" | "text";
  label?: string;
  previous: number | string;
  current: number | string;
  delta?: number;
}

export interface ActorResponseData {
  actorId: string;
  actorName: string;
  action: string;
  reasoning: string;
  proposedChanges: StateChange[];
}

export interface ResolverSummary {
  effectsApplied: string[];
  clamped: string[];
  rejected: string[];
  runtimePath?: "scenario_package";
  runtimeNote?: string;
}

export interface RuntimeAlert {
  code: string;
  stage:
    | "turn_resolution"
    | "narration"
    | "choice_generation"
    | "choice_regeneration"
    | "initial_page";
  severity: "warning" | "error";
  summary: string;
  detail: string;
  retryable: boolean;
}

export interface ResolverDebug {
  runtime?: {
    path: "scenario_package";
    note?: string;
    narrationSource?: "llm" | "fallback";
    alerts?: RuntimeAlert[];
  };
  effectsReceived: Array<{
    type: string;
    intensity: 'minor' | 'moderate' | 'major';
    scope?: string;
    target?: string;
  }>;
  effectsApplied: Array<{
    effect: { type: string; intensity: string };
    warnings: string[];
    clamped: boolean;
  }>;
  effectsRejected: Array<{
    effect: { type: string; intensity: string };
    reason: string;
  }>;
  constraintsApplied: string[];
  choiceExecution?: {
    choiceId: string;
    text: string;
    source?: "llm" | "suggested";
    mode: "structured" | "interpreted_text";
    effects: Array<{
      effectId: string;
      intensity: "minor" | "moderate" | "major";
      bindings: Record<string, string>;
    }>;
    debugReasoning?: string;
    debugReasoningSource?: "llm" | "suggested";
  };
}

export interface TurnResult {
  turn: number;
  playerChoice: { id: string; text: string };
  stateChanges: StateChange[];
  events: GameEvent[];
  actorResponses: ActorResponseData[];
  newState: ScenarioState;
  resolverSummary?: ResolverSummary;
  resolverDebug?: ResolverDebug;
}

export interface Choice {
  id: string;
  text: string;
  description: string;
  source?: "llm" | "suggested";
  debugReasoning?: string;
  debugReasoningSource?: "llm" | "suggested";
  execution?: {
    kind: "scenario_effect";
    invocation: ScenarioEffectInvocation;
  };
}

export interface StructuredNarrative {
  playerAction: string;
  consequences: string;
  otherActions: { actor: string; description: string; order: number }[];
  worldUpdate: string;
}

export interface PageData {
  title: string;
  narrative: StructuredNarrative;
  stateSummary: {
    playerResources: Array<ResourceState & { change?: VisibleStateChange }>;
    keyActors: { name: string; status: string; relationship: string; changes?: VisibleStateChange[] }[];
    activeTensions: Array<string | { text: string; change?: VisibleStateChange }>;
    worldState: { name: string; value: string; kind: WorldVariableKind; minValue: string | null; maxValue: string | null; change?: VisibleStateChange }[];
    scenarioObjects?: {
      id: string;
      typeId: string;
      typeLabel: string;
      name: string;
      fields: Record<string, string | number | boolean>;
    }[];
  };
  choices: Choice[];
}
