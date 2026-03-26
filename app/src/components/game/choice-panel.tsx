"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Choice } from "@/lib/types";

interface ChoicePanelProps {
  choices: Choice[];
  onChoice: (choiceId: string) => void;
  disabled: boolean;
}

export function ChoicePanel({ choices, onChoice, disabled }: ChoicePanelProps) {
  if (!choices || choices.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          No choices available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        What will you do?
      </p>
      <div className="grid gap-2">
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            onClick={() => {
              if (!disabled && confirm(`Choose: "${choice.text}"?`)) {
                onChoice(choice.id);
              }
            }}
            disabled={disabled}
            className={`
              text-left p-4 rounded-lg border transition-all
              ${
                disabled
                  ? "opacity-50 cursor-not-allowed border-border"
                  : "hover:border-primary hover:bg-accent cursor-pointer border-border"
              }
            `}
          >
            <div className="flex gap-3">
              <span className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0">
                {index + 1}
              </span>
              <div>
                <p className="font-medium text-sm">{choice.text}</p>
                {choice.description && choice.description !== choice.text && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {choice.description}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
