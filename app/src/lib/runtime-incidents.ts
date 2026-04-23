import type { RuntimeAlert } from "@/lib/types";
import { buildRuntimeAlertFromCode } from "@/lib/runtime-feedback";

export interface RuntimeIncidentTurnRecord {
  turnNumber: number;
  playerChoiceText: string | null;
  renderedPage: {
    title: string;
  } | null;
  resolverLog?: unknown;
}

export interface RuntimeIncident {
  turnNumber: number;
  title: string;
  playerChoiceText: string | null;
  alert: RuntimeAlert;
}

export interface RuntimeIncidentSummary {
  totalIncidentTurns: number;
  totalIncidents: number;
  countsByCode: Array<{ code: string; count: number }>;
  incidentsByTurn: RuntimeIncident[];
}

export function summarizeRuntimeIncidents(
  turns: RuntimeIncidentTurnRecord[]
): RuntimeIncidentSummary {
  const incidentsByTurn: RuntimeIncident[] = [];
  const counts = new Map<string, number>();
  const turnsWithIncidents = new Set<number>();

  for (const turn of turns) {
    const alerts = extractRuntimeAlerts(turn.resolverLog);
    for (const alert of alerts) {
      incidentsByTurn.push({
        turnNumber: turn.turnNumber,
        title: turn.renderedPage?.title ?? `Turn ${turn.turnNumber}`,
        playerChoiceText: turn.playerChoiceText,
        alert,
      });
      counts.set(alert.code, (counts.get(alert.code) ?? 0) + 1);
      turnsWithIncidents.add(turn.turnNumber);
    }
  }

  return {
    totalIncidentTurns: turnsWithIncidents.size,
    totalIncidents: incidentsByTurn.length,
    countsByCode: [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    incidentsByTurn: incidentsByTurn.sort(
      (a, b) => a.turnNumber - b.turnNumber || a.alert.code.localeCompare(b.alert.code)
    ),
  };
}

export function extractRuntimeAlerts(resolverLog: unknown): RuntimeAlert[] {
  if (!isRecord(resolverLog) || !isRecord(resolverLog.runtime)) {
    return [];
  }

  const runtime = resolverLog.runtime;
  const alerts = Array.isArray(runtime.alerts)
    ? runtime.alerts.filter(isRuntimeAlert)
    : [];

  if (alerts.length > 0) {
    return dedupeRuntimeAlerts(alerts);
  }

  if (typeof runtime.note === "string" && runtime.note.length > 0) {
    return [buildRuntimeAlertFromCode(runtime.note)];
  }

  return [];
}

function dedupeRuntimeAlerts(alerts: RuntimeAlert[]): RuntimeAlert[] {
  const seen = new Set<string>();
  const result: RuntimeAlert[] = [];

  for (const alert of alerts) {
    if (seen.has(alert.code)) continue;
    seen.add(alert.code);
    result.push(alert);
  }

  return result;
}

function isRuntimeAlert(value: unknown): value is RuntimeAlert {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.stage === "string" &&
    typeof value.severity === "string" &&
    typeof value.summary === "string" &&
    typeof value.detail === "string" &&
    typeof value.retryable === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
