"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewScenarioPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const worldDescription = formData.get("worldDescription") as string;

    if (!name.trim()) {
      setError("Scenario name is required");
      setSaving(false);
      return;
    }

    if (!description.trim()) {
      setError("Description is required");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, worldDescription }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create scenario");
      }

      const scenario = await res.json();
      router.push(`/scenarios/${scenario.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scenario");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create New Scenario</CardTitle>
          <CardDescription>
            Define the world, then add actors and relationships in the editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Scenario Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. The Silk Road Standoff"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief overview of the scenario — what's at stake, who's involved..."
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="worldDescription">World Description</Label>
              <Textarea
                id="worldDescription"
                name="worldDescription"
                placeholder="Describe the setting — era, geography, political situation, key tensions..."
                rows={5}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Scenario"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
