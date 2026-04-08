"use client";

import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { StructuredNarrative } from "@/lib/types";

interface NarrativePanelProps {
  narrative: StructuredNarrative;
  resolving: boolean;
}

export function NarrativePanel({ narrative, resolving }: NarrativePanelProps) {
  // Handle legacy string narratives from existing sessions
  const isStructured = typeof narrative === "object" && narrative.playerAction;

  return (
    <Card>
      <CardContent className="py-6 relative">
        {resolving && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-lg z-10">
            <div className="text-center space-y-2">
              <div className="animate-pulse text-lg font-medium">
                Resolving...
              </div>
              <p className="text-sm text-muted-foreground">
                The world responds to your choice
              </p>
            </div>
          </div>
        )}

        {isStructured ? (
          <div className="space-y-4">
            {/* Player Action */}
            {narrative.playerAction && (
              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Your Action
                </h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{narrative.playerAction}</ReactMarkdown>
                </div>
              </section>
            )}

            {/* Consequences */}
            {narrative.consequences && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Consequences
                  </h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{narrative.consequences}</ReactMarkdown>
                  </div>
                </section>
              </>
            )}

            {/* Other Actions */}
            {narrative.otherActions && narrative.otherActions.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Other Actions
                  </h3>
                  <div className="space-y-3">
                    {narrative.otherActions.map((action, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-xs font-mono text-muted-foreground mt-1 shrink-0">
                          {action.order ?? i + 1}
                        </span>
                        <div>
                          <span className="font-medium text-sm">
                            {action.actor}
                          </span>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{action.description}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* World Update */}
            {narrative.worldUpdate && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    World Update
                  </h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                    <ReactMarkdown>{narrative.worldUpdate}</ReactMarkdown>
                  </div>
                </section>
              </>
            )}
          </div>
        ) : (
          // Fallback for legacy string narratives
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{String(narrative)}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
