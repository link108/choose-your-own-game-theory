// Shared TypeScript types for the simulation engine

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

export interface WorldVariableState {
  id: string;
  name: string;
  value: string;
  type: string;
  minValue: string | null;
  maxValue: string | null;
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
  eventHistory: GameEvent[];
}

export interface StateChange {
  type: "resource" | "relationship" | "worldVariable" | "actorStatus";
  target: string;
  field: string;
  oldValue: number | string;
  newValue: number | string;
  reason: string;
}

export interface ActorResponseData {
  actorId: string;
  actorName: string;
  action: string;
  reasoning: string;
  proposedChanges: StateChange[];
}

export interface TurnResult {
  turn: number;
  playerChoice: { id: string; text: string };
  stateChanges: StateChange[];
  events: GameEvent[];
  actorResponses: ActorResponseData[];
  newState: ScenarioState;
}

export interface Choice {
  id: string;
  text: string;
  description: string;
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
    playerResources: ResourceState[];
    keyActors: { name: string; status: string; relationship: string }[];
    activeTensions: string[];
    worldState: { name: string; value: string; type: string; minValue: string | null; maxValue: string | null }[];
  };
  choices: Choice[];
}
