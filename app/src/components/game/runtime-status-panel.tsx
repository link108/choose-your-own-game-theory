"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { ResolverDebug, RuntimeAlert } from "@/lib/types";
import { buildRuntimeAlertFromCode } from "@/lib/runtime-feedback";

export function RuntimeStatusPanel({
  resolverLog,
}: {
  resolverLog: ResolverDebug | null;
}) {
  if (!resolverLog?.runtime) {
    return null;
  }

  const runtimeAlerts =
    resolverLog.runtime.alerts && resolverLog.runtime.alerts.length > 0
      ? resolverLog.runtime.alerts
      : resolverLog.runtime.note
        ? [buildRuntimeAlertFromCode(resolverLog.runtime.note)]
        : [];

  if (runtimeAlerts.length === 0 && resolverLog.runtime.narrationSource !== "fallback") {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Runtime: {resolverLog.runtime.path}</Badge>
        {resolverLog.runtime.narrationSource === "fallback" && (
          <Badge variant="outline">Narration fallback</Badge>
        )}
      </div>

      {runtimeAlerts.map((alert, index) => (
        <RuntimeAlertCard key={`${alert.code}-${index}`} alert={alert} />
      ))}
    </div>
  );
}

function RuntimeAlertCard({ alert }: { alert: RuntimeAlert }) {
  return (
    <Alert variant={alert.severity === "error" ? "destructive" : "default"}>
      <AlertDescription className="space-y-1">
        <p className="font-medium">{alert.summary}</p>
        <p className="text-sm text-muted-foreground">{alert.detail}</p>
        <p className="text-xs text-muted-foreground">
          Code: {alert.code}
          {alert.retryable ? " · retryable" : ""}
        </p>
      </AlertDescription>
    </Alert>
  );
}
