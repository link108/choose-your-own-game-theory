"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Choice, StateChange, ResolverDebug } from "@/lib/types";

interface ActorResponse {
  actorId: string;
  action: string;
  reasoning: string;
}

interface DebugPanelProps {
  turnNumber: number;
  choices: Choice[];
  actorResponses: ActorResponse[];
  stateChanges: StateChange[];
  resolverLog: ResolverDebug | null;
}

type Section = "choices" | "actors" | "changes" | "resolver";

export function DebugPanel({
  turnNumber,
  choices,
  actorResponses,
  stateChanges,
  resolverLog,
}: DebugPanelProps) {
  const [open, setOpen] = useState<Section | null>(null);

  function toggle(section: Section) {
    setOpen((prev) => (prev === section ? null : section));
  }

  return (
    <Card className="border-dashed border-yellow-500/50 bg-yellow-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono text-yellow-600 dark:text-yellow-400">
          DEBUG — Turn {turnNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs font-mono">
        {/* Choices */}
        <SectionToggle
          label={`Choices (${choices.length})`}
          open={open === "choices"}
          onToggle={() => toggle("choices")}
        />
        {open === "choices" && (
          <div className="space-y-2 pl-2 border-l border-yellow-500/30">
            {choices.length === 0 ? (
              <p className="text-muted-foreground">none</p>
            ) : (
              choices.map((choice) => (
                <div key={choice.id} className="space-y-0.5">
                  <p className="font-semibold">{choice.id}</p>
                  <p className="text-muted-foreground">text: {choice.text}</p>
                  <p className="text-muted-foreground">
                    source: {choice.source ?? "unknown"}
                  </p>
                  {choice.debugReasoning && (
                    <p className="text-muted-foreground">
                      rationale
                      {choice.debugReasoningSource
                        ? ` (${choice.debugReasoningSource})`
                        : ""}: {choice.debugReasoning}
                    </p>
                  )}
                  {choice.execution?.kind === "scenario_effect" && (
                    <>
                      <p className="text-muted-foreground">
                        execution: {choice.execution.invocation.effectId} (
                        {choice.execution.invocation.intensity})
                      </p>
                      <p className="text-muted-foreground pl-2">
                        bindings:{" "}
                        {Object.entries(choice.execution.invocation.bindings)
                          .map(([key, value]) => `${key}=${value}`)
                          .join(", ")}
                      </p>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Actor Responses */}
        <SectionToggle
          label={`Actor Responses (${actorResponses.length})`}
          open={open === "actors"}
          onToggle={() => toggle("actors")}
        />
        {open === "actors" && (
          <div className="space-y-2 pl-2 border-l border-yellow-500/30">
            {actorResponses.length === 0 ? (
              <p className="text-muted-foreground">none</p>
            ) : (
              actorResponses.map((r, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="font-semibold">{r.actorId}</p>
                  <p className="text-muted-foreground">action: {r.action}</p>
                  <p className="text-muted-foreground">reasoning: {r.reasoning}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* State Changes */}
        <SectionToggle
          label={`State Changes (${stateChanges.length})`}
          open={open === "changes"}
          onToggle={() => toggle("changes")}
        />
        {open === "changes" && (
          <div className="space-y-1 pl-2 border-l border-yellow-500/30">
            {stateChanges.length === 0 ? (
              <p className="text-muted-foreground">none</p>
            ) : (
              stateChanges.map((c, i) => (
                <div key={i} className="space-y-0.5">
                  <p>
                    <span className="text-yellow-600 dark:text-yellow-400">{c.type}</span>{" "}
                    {c.target} · {c.field}:{" "}
                    <span className="line-through text-muted-foreground">{String(c.oldValue)}</span>
                    {" → "}
                    <span className="text-green-600 dark:text-green-400">{String(c.newValue)}</span>
                  </p>
                  <p className="text-muted-foreground pl-2">{c.reason}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Resolver Debug */}
        {resolverLog && (
          <>
            <SectionToggle
              label={`Resolver (${resolverLog.effectsApplied.length} applied, ${resolverLog.effectsRejected.length} rejected)`}
              open={open === "resolver"}
              onToggle={() => toggle("resolver")}
            />
            {open === "resolver" && (
              <div className="space-y-2 pl-2 border-l border-yellow-500/30">
                {resolverLog.effectsApplied.length > 0 && (
                  <div>
                    <p className="text-green-600 dark:text-green-400 mb-1">Applied:</p>
                    {resolverLog.effectsApplied.map((e, i) => (
                      <p key={i} className="text-muted-foreground pl-2">
                        {e.effect.type} ({e.effect.intensity}){e.clamped ? " [clamped]" : ""}
                        {e.warnings.length > 0 ? ` ⚠ ${e.warnings.join(", ")}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {resolverLog.effectsRejected.length > 0 && (
                  <div>
                    <p className="text-red-500 mb-1">Rejected:</p>
                    {resolverLog.effectsRejected.map((e, i) => (
                      <p key={i} className="text-muted-foreground pl-2">
                        {e.effect.type} ({e.effect.intensity}) — {e.reason}
                      </p>
                    ))}
                  </div>
                )}
                {resolverLog.constraintsApplied.length > 0 && (
                  <div>
                    <p className="text-blue-500 mb-1">Constraints:</p>
                    {resolverLog.constraintsApplied.map((c, i) => (
                      <p key={i} className="text-muted-foreground pl-2">{c}</p>
                    ))}
                  </div>
                )}
                {resolverLog.choiceExecution && (
                  <div>
                    <p className="text-yellow-600 dark:text-yellow-400 mb-1">
                      Selected choice:
                    </p>
                    <p className="text-muted-foreground pl-2">
                      {resolverLog.choiceExecution.choiceId}: {resolverLog.choiceExecution.text}
                    </p>
                    <p className="text-muted-foreground pl-2">
                      mode: {resolverLog.choiceExecution.mode}
                      {resolverLog.choiceExecution.source
                        ? ` · source: ${resolverLog.choiceExecution.source}`
                        : ""}
                    </p>
                    {resolverLog.choiceExecution.debugReasoning && (
                      <p className="text-muted-foreground pl-2">
                        rationale
                        {resolverLog.choiceExecution.debugReasoningSource
                          ? ` (${resolverLog.choiceExecution.debugReasoningSource})`
                          : ""}: {resolverLog.choiceExecution.debugReasoning}
                      </p>
                    )}
                    {resolverLog.choiceExecution.effects.length > 0 && (
                      <div className="pl-2">
                        {resolverLog.choiceExecution.effects.map((effect, i) => (
                          <p key={i} className="text-muted-foreground">
                            effect: {effect.effectId} ({effect.intensity})
                            {Object.keys(effect.bindings).length > 0
                              ? ` · ${Object.entries(effect.bindings)
                                  .map(([key, value]) => `${key}=${value}`)
                                  .join(", ")}`
                              : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SectionToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full text-left flex items-center justify-between py-1 px-2 rounded hover:bg-yellow-500/10 transition-colors"
    >
      <span>{label}</span>
      <span className="text-muted-foreground">{open ? "−" : "+"}</span>
    </button>
  );
}
