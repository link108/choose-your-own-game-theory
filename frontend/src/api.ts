export type Role = { name: string; description: string; private_info: string };
export type NPC = { name: string; description: string; hidden_agenda: string };

export type ScenarioFields = {
  title: string;
  premise: string;
  setting: string;
  tone: string;
  goal: string;
  gm_notes: string;
  roles: Role[];
  npcs: NPC[];
};

export type Scenario = ScenarioFields & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type Option = { id: string; text: string; reasoning?: string; custom?: boolean };

export type PlayerView = {
  narrative: string;
  visible_state_summary: string;
  options: Option[];
  epilogue: string;
};

export type Turn = {
  index: number;
  player_view: PlayerView;
  chosen_option_id: string | null;
  is_final: boolean;
  created_at: string;
};

export type Playthrough = {
  id: string;
  scenario_id: string;
  role_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  turn_count: number;
};

export type PlaythroughDetail = {
  id: string;
  scenario_id: string;
  scenario_title: string;
  role_name: string;
  status: string;
  turns: Turn[];
};

export type SuggestActionResult = {
  accepted: boolean;
  reason: string;
  turn: Turn;
};

export type ActorState = { name: string; status: string; intent: string; reasoning: string };

export type GMState = {
  scene_summary: string;
  actors: ActorState[];
  hidden_facts: string[];
  goal_progress: string;
};

export type ReviewTurn = Turn & { gm_state: GMState };

export type PlaythroughReview = Omit<PlaythroughDetail, "turns"> & { turns: ReviewTurn[] };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* non-json error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listScenarios: () => req<Scenario[]>("/api/scenarios"),
  getScenario: (id: string) => req<Scenario>(`/api/scenarios/${id}`),
  createScenario: (body: ScenarioFields) =>
    req<Scenario>("/api/scenarios", { method: "POST", body: JSON.stringify(body) }),
  updateScenario: (id: string, body: ScenarioFields) =>
    req<Scenario>(`/api/scenarios/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteScenario: (id: string) => req<void>(`/api/scenarios/${id}`, { method: "DELETE" }),
  draftScenario: (concept: string) =>
    req<ScenarioFields>("/api/scenarios/draft", {
      method: "POST",
      body: JSON.stringify({ concept }),
    }),

  startPlaythrough: (scenarioId: string, roleName: string) =>
    req<PlaythroughDetail>(`/api/scenarios/${scenarioId}/playthroughs`, {
      method: "POST",
      body: JSON.stringify({ role_name: roleName }),
    }),
  listPlaythroughs: (scenarioId: string) =>
    req<Playthrough[]>(`/api/scenarios/${scenarioId}/playthroughs`),
  getPlaythrough: (id: string) => req<PlaythroughDetail>(`/api/playthroughs/${id}`),
  choose: (id: string, optionId: string) =>
    req<Turn>(`/api/playthroughs/${id}/choice`, {
      method: "POST",
      body: JSON.stringify({ option_id: optionId }),
    }),
  suggestAction: (id: string, text: string) =>
    req<SuggestActionResult>(`/api/playthroughs/${id}/suggest-action`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  regenerate: (id: string) =>
    req<Turn>(`/api/playthroughs/${id}/regenerate`, { method: "POST" }),
  abandon: (id: string) => req<Playthrough>(`/api/playthroughs/${id}/abandon`, { method: "POST" }),
  review: (id: string) => req<PlaythroughReview>(`/api/playthroughs/${id}/review`),
};
