"use client";

import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";

interface NarrativePanelProps {
  narrative: string;
  resolving: boolean;
}

export function NarrativePanel({ narrative, resolving }: NarrativePanelProps) {
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
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{narrative}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
