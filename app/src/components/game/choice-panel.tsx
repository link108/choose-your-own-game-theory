"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Choice } from "@/lib/types";

interface ChoicePanelProps {
  choices: Choice[];
  onChoice: (choiceId: string) => void;
  onRegenerate: () => void;
  onSuggestAction: (suggestedAction: string) => void;
  disabled: boolean;
}

export function ChoicePanel({
  choices,
  onChoice,
  onRegenerate,
  onSuggestAction,
  disabled,
}: ChoicePanelProps) {
  const [suggestedAction, setSuggestedAction] = useState("");
  const [expandedChoiceIds, setExpandedChoiceIds] = useState<string[]>([]);

  function toggleChoiceReasoning(choiceId: string) {
    setExpandedChoiceIds((current) =>
      current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId]
    );
  }

  if (!choices || choices.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground space-y-4">
          <div>No choices available.</div>
          <div className="flex flex-col gap-2 max-w-xl mx-auto">
            <Button variant="outline" onClick={onRegenerate} disabled={disabled}>
              Regenerate choices
            </Button>
            <div className="flex gap-2">
              <Input
                value={suggestedAction}
                onChange={(event) => setSuggestedAction(event.target.value)}
                placeholder="Suggest an action idea"
                disabled={disabled}
              />
              <Button
                onClick={() => {
                  const trimmed = suggestedAction.trim();
                  if (!trimmed) return;
                  onSuggestAction(trimmed);
                  setSuggestedAction("");
                }}
                disabled={disabled || suggestedAction.trim().length === 0}
              >
                Use idea
              </Button>
            </div>
          </div>
          </CardContent>
        </Card>
      );
    }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          What will you do?
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={disabled}
        >
          Regenerate
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          value={suggestedAction}
          onChange={(event) => setSuggestedAction(event.target.value)}
          placeholder="Suggest an action idea to include"
          disabled={disabled}
        />
        <Button
          variant="outline"
          onClick={() => {
            const trimmed = suggestedAction.trim();
            if (!trimmed) return;
            onSuggestAction(trimmed);
            setSuggestedAction("");
          }}
          disabled={disabled || suggestedAction.trim().length === 0}
        >
          Regenerate With Idea
        </Button>
      </div>
      <div className="grid gap-2">
        {choices.map((choice, index) => (
          <div
            key={choice.id}
            className={`
              rounded-lg border p-4 transition-all
              ${disabled ? "opacity-50 border-border" : "border-border hover:border-primary"}
            `}
          >
            <button
              onClick={() => {
                if (!disabled && confirm(`Choose: "${choice.text}"?`)) {
                  onChoice(choice.id);
                }
              }}
              disabled={disabled}
              className={`
                w-full text-left transition-colors
                ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-accent"}
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
            {choice.debugReasoning && (
              <div className="ml-6 mt-2 space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => toggleChoiceReasoning(choice.id)}
                  className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  {expandedChoiceIds.includes(choice.id)
                    ? "Hide why"
                    : "Why this option?"}
                </Button>
                {expandedChoiceIds.includes(choice.id) && (
                  <p className="text-xs text-muted-foreground">
                    {choice.debugReasoning}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
