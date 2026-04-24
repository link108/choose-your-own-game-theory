"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { ScenarioCreationWorkingDraft } from "@/lib/scenario-creation/schema";

interface ScenarioCreationMessageRecord {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  kind: "CHAT" | "SUMMARY" | "OPTION_PROMPT" | "DRAFT_UPDATE";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ScenarioCreationOptionRecord {
  id: string;
  label: string;
  description?: string;
  payload?: Record<string, unknown>;
}

interface ScenarioCreationOptionGroupRecord {
  id: string;
  stage: string;
  kind: string;
  title: string;
  description: string | null;
  selectionMode: "SINGLE" | "MULTIPLE";
  status: "OPEN" | "RESOLVED" | "SUPERSEDED";
  options: ScenarioCreationOptionRecord[];
  createdAt: string;
  updatedAt: string;
}

interface ScenarioCreationSessionRecord {
  id: string;
  status: "ACTIVE" | "DRAFT_READY" | "ACCEPTED" | "ABANDONED";
  title: string | null;
  sourcePrompt: string;
  workingDraft: ScenarioCreationWorkingDraft | null;
  createdScenarioId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ScenarioCreationMessageRecord[];
  optionGroups: ScenarioCreationOptionGroupRecord[];
}

export function ScenarioCreationShell() {
  const [session, setSession] = useState<ScenarioCreationSessionRecord | null>(null);
  const [composer, setComposer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const openOptionGroups =
    session?.optionGroups.filter((group) => group.status === "OPEN") ?? [];

  async function ensureSession() {
    if (session) return session;

    const response = await fetch("/api/scenario-creation/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await response.json().catch(() => null)) as
      | ScenarioCreationSessionRecord
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        data && "error" in data
          ? data.error
          : "Failed to create scenario creation session"
      );
    }

    const nextSession = data as ScenarioCreationSessionRecord;
    setSession(nextSession);
    return nextSession;
  }

  async function startConversation() {
    setLoading(true);
    setError("");
    try {
      await ensureSession();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start scenario creation conversation"
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    const content = composer.trim();
    if (!content) return;

    setLoading(true);
    setError("");

    try {
      const currentSession = await ensureSession();
      const response = await fetch(
        `/api/scenario-creation/sessions/${currentSession.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      const data = (await response.json().catch(() => null)) as
        | ScenarioCreationSessionRecord
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data
            ? data.error
            : "Failed to send scenario creation message"
        );
      }

      setSession(data as ScenarioCreationSessionRecord);
      setComposer("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send scenario creation message"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversational Scenario Creation</CardTitle>
        <CardDescription>
          Start with a rough idea, chat with the assistant, review structured
          options, and build a non-canonical draft before you accept anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!session && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void startConversation()} disabled={loading}>
              {loading ? "Starting..." : "Start Conversation"}
            </Button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="space-y-4">
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Chat</CardTitle>
                <CardDescription>
                  The assistant uses the existing LLM stack, but this draft remains
                  non-canonical until an explicit accept flow is added.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-80 rounded-md border">
                  <div className="space-y-3 p-4">
                    {session?.messages.length ? (
                      session.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-lg border p-3 ${
                            message.role === "USER"
                              ? "ml-8 bg-muted/40"
                              : "mr-8 bg-background"
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="outline">
                              {message.role === "USER" ? "You" : "Assistant"}
                            </Badge>
                            <Badge variant="outline">{message.kind}</Badge>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">
                            {message.content}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Start a conversation to begin shaping a scenario.
                      </p>
                    )}
                  </div>
                </ScrollArea>

                <div className="space-y-2">
                  <Textarea
                    rows={4}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder="Example: I want to model a diplomatic crisis in the Strait of Hormuz."
                    disabled={loading}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void sendMessage()}
                      disabled={loading || !composer.trim()}
                    >
                      {loading ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Structured Options</CardTitle>
                <CardDescription>
                  Milestone 2 only renders option groups. Selection and rejection
                  actions come in a later milestone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {openOptionGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    The assistant has not proposed any structured options yet.
                  </p>
                ) : (
                  openOptionGroups.map((group) => (
                    <div key={group.id} className="space-y-3 rounded-md border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{group.title}</p>
                        <Badge variant="outline">{group.kind}</Badge>
                        <Badge variant="outline">{group.selectionMode}</Badge>
                      </div>
                      {group.description && (
                        <p className="text-sm text-muted-foreground">
                          {group.description}
                        </p>
                      )}
                      <div className="grid gap-3 md:grid-cols-2">
                        {group.options.map((option) => (
                          <Card key={option.id}>
                            <CardHeader className="space-y-2">
                              <CardTitle className="text-sm">{option.label}</CardTitle>
                              {option.description && (
                                <CardDescription>{option.description}</CardDescription>
                              )}
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <Badge variant="outline">{option.id}</Badge>
                              {option.payload &&
                                Object.keys(option.payload).length > 0 && (
                                  <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                                    {JSON.stringify(option.payload, null, 2)}
                                  </pre>
                                )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Working Draft</CardTitle>
              <CardDescription>
                This is a non-canonical JSON draft snapshot that the conversation
                can update safely over time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[36rem] rounded-md border bg-muted/20">
                <pre className="p-4 text-xs leading-5">
                  {JSON.stringify(session?.workingDraft ?? {}, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
