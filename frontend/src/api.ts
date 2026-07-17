export type Role = { name: string; description: string; private_info: string };
export type NPC = { name: string; description: string; hidden_agenda: string };

export type ScenarioFields = {
  title: string;
  category: string;
  premise: string;
  setting: string;
  tone: string;
  goal: string;
  gm_notes: string;
  context_enabled: boolean;
  context_prompt: string;
  context_disclaimer: string;
  risk_domain: "general" | "health" | "legal" | "financial" | "safety";
  roles: Role[];
  npcs: NPC[];
};

export type Scenario = ScenarioFields & {
  id: string;
  is_library: boolean;
  is_living: boolean;
  created_at: string;
  updated_at: string;
};

export type ScenarioContent = Omit<
  ScenarioFields,
  "category" | "context_enabled" | "context_prompt" | "context_disclaimer" | "risk_domain"
>;

export type ScenarioDraft = Omit<
  ScenarioFields,
  "category" | "context_enabled" | "context_prompt" | "context_disclaimer" | "risk_domain"
>;

export type Source = { outlet: string; lean: string; title: string; url: string };

export type ScenarioUpdate = {
  id: string;
  headline: string;
  summary: string;
  changes: string;
  sources: Source[];
  created_at: string;
};

export type ScenarioUpdateAdmin = ScenarioUpdate & {
  scenario_id: string;
  scenario_title: string;
  status: string;
  proposed: ScenarioContent;
  current: ScenarioContent;
  reviewed_at: string | null;
};

export type LivingRunResult = {
  scenarios_checked: number;
  drafts_created: number;
  skipped_pending_review: number;
  articles_fetched: number;
  errors: string[];
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

export type ContextAnswer = { question: string; answer: string };

export type PlayerContext = {
  initial_context: string;
  answers: ContextAnswer[];
};

export type ContextIntakeResult = {
  status: "needs_more" | "ready";
  questions: string[];
  summary: string;
  missing: string[];
  urgent_warning: string;
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

export type DecisionAssessment = {
  turn_index: number;
  choice: string;
  commentary: string;
  better_alternative: string;
};

export type PlaythroughAnalysis = {
  outcome: string;
  overall: string;
  decisions: DecisionAssessment[];
  strengths: string[];
  improvements: string[];
};

export type PlaythroughReview = Omit<PlaythroughDetail, "turns"> & {
  turns: ReviewTurn[];
  analysis: PlaythroughAnalysis | null;
};

export type ScenarioProgress = {
  trend: string;
  overall: string;
  patterns: string[];
  strengths: string[];
  improvements: string[];
};

export type ScenarioInsight = {
  scenario_id: string;
  runs_analyzed: number;
  insight: ScenarioProgress;
  generated_at: string;
};

export type ScenarioStats = {
  scenario_id: string;
  title: string;
  attempts: number;
  active: number;
  completed: number;
  abandoned: number;
  total_turns: number;
  avg_turns: number;
  last_played_at: string | null;
  has_insight: boolean;
};

export type UserStats = {
  scenarios_tried: number;
  total_playthroughs: number;
  active: number;
  completed: number;
  abandoned: number;
  total_turns: number;
  avg_turns: number;
  scenarios: ScenarioStats[];
};

export type AdminTotals = {
  users: number;
  guest_sessions: number;
  scenarios: number;
  playthroughs: number;
  active: number;
  completed: number;
  abandoned: number;
  total_turns: number;
  llm_calls: number;
};

export type AdminUserStats = {
  session_id: string;
  email: string | null;
  role: string | null;
  scenarios_created: number;
  scenarios_tried: number;
  playthroughs: number;
  active: number;
  completed: number;
  abandoned: number;
  total_turns: number;
  avg_turns: number;
  last_active_at: string | null;
};

export type AdminScenarioStats = {
  scenario_id: string;
  title: string;
  is_library: boolean;
  is_living: boolean;
  players: number;
  attempts: number;
  completed: number;
  total_turns: number;
  avg_turns: number;
  last_played_at: string | null;
};

export type AdminStats = {
  totals: AdminTotals;
  users: AdminUserStats[];
  scenarios: AdminScenarioStats[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const AUTH_TOKEN_KEY = "cyoa_token";

export const authToken = {
  get: () => localStorage.getItem(AUTH_TOKEN_KEY) ?? "",
  set: (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(AUTH_TOKEN_KEY),
};

export type User = {
  id: string;
  email: string;
  email_verified: boolean;
  role: string;
  created_at: string;
};
export type AuthResponse = { token: string; user: User };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authToken.get();
  const res = await fetch(path, {
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : undefined),
    },
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
  listLibrary: () => req<Scenario[]>("/api/scenarios/library"),
  getScenario: (id: string) => req<Scenario>(`/api/scenarios/${id}`),
  createScenario: (body: ScenarioFields) =>
    req<Scenario>("/api/scenarios", { method: "POST", body: JSON.stringify(body) }),
  updateScenario: (id: string, body: ScenarioFields) =>
    req<Scenario>(`/api/scenarios/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteScenario: (id: string) => req<void>(`/api/scenarios/${id}`, { method: "DELETE" }),
  draftScenario: (concept: string) =>
    req<ScenarioDraft>("/api/scenarios/draft", {
      method: "POST",
      body: JSON.stringify({ concept }),
    }),

  assessContext: (scenarioId: string, roleName: string, context: PlayerContext) =>
    req<ContextIntakeResult>(`/api/scenarios/${scenarioId}/context-intake`, {
      method: "POST",
      body: JSON.stringify({ role_name: roleName, ...context }),
    }),
  startPlaythrough: (
    scenarioId: string,
    roleName: string,
    context?: PlayerContext,
    contextSummary = "",
  ) =>
    req<PlaythroughDetail>(`/api/scenarios/${scenarioId}/playthroughs`, {
      method: "POST",
      body: JSON.stringify({
        role_name: roleName,
        context,
        context_summary: contextSummary,
      }),
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
  analyze: (id: string) =>
    req<PlaythroughAnalysis>(`/api/playthroughs/${id}/analysis`, { method: "POST" }),

  // stats + cross-run progress insight
  myStats: () => req<UserStats>("/api/me/stats"),
  getInsight: (scenarioId: string) =>
    req<ScenarioInsight>(`/api/scenarios/${scenarioId}/insight`),
  generateInsight: (scenarioId: string) =>
    req<ScenarioInsight>(`/api/scenarios/${scenarioId}/insight`, { method: "POST" }),

  // auth
  register: (email: string, password: string) =>
    req<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    req<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<User>("/api/auth/me"),
  requestPasswordReset: (email: string) =>
    req<{ detail: string }>("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    req<AuthResponse>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    req<User>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: () =>
    req<{ detail: string }>("/api/auth/resend-verification", { method: "POST" }),

  // living scenarios: player-facing situation log
  listUpdates: (scenarioId: string) =>
    req<ScenarioUpdate[]>(`/api/scenarios/${scenarioId}/updates`),

  // living scenarios: admin (require a signed-in admin)
  adminRunLiving: (scenarioId?: string) =>
    req<LivingRunResult>("/api/admin/living/run", {
      method: "POST",
      body: JSON.stringify(scenarioId ? { scenario_id: scenarioId } : {}),
    }),
  adminListUpdates: (status?: string) =>
    req<ScenarioUpdateAdmin[]>(
      `/api/admin/living/updates${status ? `?status=${status}` : ""}`,
    ),
  adminApproveUpdate: (id: string) =>
    req<ScenarioUpdateAdmin>(`/api/admin/living/updates/${id}/approve`, { method: "POST" }),
  adminRejectUpdate: (id: string) =>
    req<ScenarioUpdateAdmin>(`/api/admin/living/updates/${id}/reject`, { method: "POST" }),
  adminStats: () => req<AdminStats>("/api/admin/stats"),
  adminSessionStats: (sessionId: string) =>
    req<ScenarioStats[]>(`/api/admin/stats/sessions/${sessionId}`),
  adminSetLiving: (scenarioId: string, isLiving: boolean) =>
    req<Scenario>(`/api/admin/scenarios/${scenarioId}/living`, {
      method: "POST",
      body: JSON.stringify({ is_living: isLiving }),
    }),
};
