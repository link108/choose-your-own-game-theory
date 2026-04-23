export interface ResourceData {
  id: string;
  actorId: string;
  name: string;
  value: number;
  minValue: number;
  maxValue: number;
}

export interface RelationshipData {
  id: string;
  fromActorId: string;
  toActorId: string;
  type: string;
  strength: number;
  description: string | null;
  toActor?: { id: string; name: string };
  fromActor?: { id: string; name: string };
}

export interface ActorData {
  id: string;
  scenarioId: string;
  name: string;
  description: string;
  goals: string[];
  traits: string[];
  isPlayer: boolean;
  createdAt: string;
  updatedAt: string;
  resources: ResourceData[];
  relationshipsFrom: RelationshipData[];
  relationshipsTo: RelationshipData[];
}

export interface WorldVariableData {
  id: string;
  scenarioId: string;
  name: string;
  value: string;
  kind: string;
  minValue: string | null;
  maxValue: string | null;
  config?: { step?: number } | null;
}

export interface ScenarioData {
  id: string;
  name: string;
  description: string;
  worldDescription: string;
  status: string;
  scenarioPackage: unknown | null;
  createdAt: string;
  updatedAt: string;
  actors: ActorData[];
  worldVariables: WorldVariableData[];
}
