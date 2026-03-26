"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteScenarioButton({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this scenario? This cannot be undone.")) return;

    await fetch(`/api/scenarios/${scenarioId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      className="text-destructive hover:text-destructive h-7 px-2"
    >
      Delete
    </Button>
  );
}
