"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActorData, ResourceData } from "./types";

interface ActorManagerProps {
  scenarioId: string;
  actors: ActorData[];
  onUpdate: () => void;
}

export function ActorManager({ scenarioId, actors, onUpdate }: ActorManagerProps) {
  const [expandedActorId, setExpandedActorId] = useState<string | null>(
    actors.length > 0 ? actors[0].id : null
  );
  const [adding, setAdding] = useState(false);

  async function handleAddActor() {
    setAdding(true);
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/actors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Actor",
          description: "",
          goals: [],
          traits: [],
          isPlayer: false,
        }),
      });
      const actor = await res.json();
      setExpandedActorId(actor.id);
      onUpdate();
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteActor(actorId: string) {
    if (!confirm("Delete this actor? This cannot be undone.")) return;
    await fetch(`/api/actors/${actorId}`, { method: "DELETE" });
    if (expandedActorId === actorId) setExpandedActorId(null);
    onUpdate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Add actors to your scenario. One must be the player character.
        </p>
        <Button onClick={handleAddActor} disabled={adding}>
          {adding ? "Adding..." : "Add Actor"}
        </Button>
      </div>

      {actors.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No actors yet. Add your first actor to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {actors.map((actor) => (
            <ActorCard
              key={actor.id}
              actor={actor}
              expanded={expandedActorId === actor.id}
              onToggle={() =>
                setExpandedActorId(
                  expandedActorId === actor.id ? null : actor.id
                )
              }
              onDelete={() => handleDeleteActor(actor.id)}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActorCard({
  actor,
  expanded,
  onToggle,
  onDelete,
  onUpdate,
}: {
  actor: ActorData;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{actor.name || "Unnamed Actor"}</CardTitle>
            {actor.isPlayer && <Badge>Player</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {actor.resources.length} resources
            </span>
            <span className="text-muted-foreground">{expanded ? "−" : "+"}</span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6">
          <ActorFields actor={actor} onUpdate={onUpdate} />
          <Separator />
          <GoalsEditor actor={actor} onUpdate={onUpdate} />
          <Separator />
          <TraitsEditor actor={actor} onUpdate={onUpdate} />
          <Separator />
          <ResourcesEditor actor={actor} onUpdate={onUpdate} />
          <Separator />
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              Delete Actor
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ActorFields({
  actor,
  onUpdate,
}: {
  actor: ActorData;
  onUpdate: () => void;
}) {
  const [name, setName] = useState(actor.name);
  const [description, setDescription] = useState(actor.description);
  const [isPlayer, setIsPlayer] = useState(actor.isPlayer);
  const [saving, setSaving] = useState(false);

  async function save(fields: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/actors/${actor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== actor.name) save({ name });
          }}
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== actor.description) save({ description });
          }}
          rows={3}
          placeholder="Who is this actor? What's their background?"
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={isPlayer}
          onCheckedChange={(checked) => {
            setIsPlayer(checked);
            save({ isPlayer: checked });
          }}
          disabled={saving}
        />
        <Label>Player Character</Label>
      </div>
    </div>
  );
}

function GoalsEditor({
  actor,
  onUpdate,
}: {
  actor: ActorData;
  onUpdate: () => void;
}) {
  const goals = actor.goals as string[];
  const [newGoal, setNewGoal] = useState("");

  async function saveGoals(updated: string[]) {
    await fetch(`/api/actors/${actor.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals: updated }),
    });
    onUpdate();
  }

  function addGoal() {
    if (!newGoal.trim()) return;
    saveGoals([...goals, newGoal.trim()]);
    setNewGoal("");
  }

  function removeGoal(index: number) {
    saveGoals(goals.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Goals</Label>
      {goals.length > 0 && (
        <div className="space-y-2">
          {goals.map((goal, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm flex-1">{goal}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGoal(i)}
                className="text-destructive hover:text-destructive h-6 px-2"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Add a goal..."
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGoal())}
        />
        <Button variant="outline" size="sm" onClick={addGoal} disabled={!newGoal.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function TraitsEditor({
  actor,
  onUpdate,
}: {
  actor: ActorData;
  onUpdate: () => void;
}) {
  const traits = actor.traits as string[];
  const [newTrait, setNewTrait] = useState("");

  async function saveTraits(updated: string[]) {
    await fetch(`/api/actors/${actor.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traits: updated }),
    });
    onUpdate();
  }

  function addTrait() {
    if (!newTrait.trim()) return;
    saveTraits([...traits, newTrait.trim().toLowerCase()]);
    setNewTrait("");
  }

  function removeTrait(index: number) {
    saveTraits(traits.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Traits</Label>
      {traits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {traits.map((trait, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => removeTrait(i)}
            >
              {trait} ×
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Add a trait..."
          value={newTrait}
          onChange={(e) => setNewTrait(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTrait())}
        />
        <Button variant="outline" size="sm" onClick={addTrait} disabled={!newTrait.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function ResourcesEditor({
  actor,
  onUpdate,
}: {
  actor: ActorData;
  onUpdate: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("0");

  async function handleAddResource() {
    if (!newName.trim()) return;
    await fetch(`/api/actors/${actor.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        value: parseInt(newValue) || 0,
      }),
    });
    setNewName("");
    setNewValue("0");
    onUpdate();
  }

  async function handleDeleteResource(resourceId: string) {
    await fetch(
      `/api/actors/${actor.id}/resources?resourceId=${resourceId}`,
      { method: "DELETE" }
    );
    onUpdate();
  }

  async function handleUpdateResource(resource: ResourceData, field: string, value: string | number) {
    await fetch(`/api/actors/${actor.id}/resources`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, [field]: value }),
    });
    onUpdate();
  }

  return (
    <div className="space-y-3">
      <Label>Resources</Label>
      {actor.resources.length > 0 && (
        <div className="space-y-2">
          {actor.resources.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                defaultValue={r.name}
                className="flex-1"
                onBlur={(e) => {
                  if (e.target.value !== r.name)
                    handleUpdateResource(r, "name", e.target.value);
                }}
              />
              <Input
                type="number"
                defaultValue={r.value}
                className="w-24"
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val !== r.value)
                    handleUpdateResource(r, "value", val);
                }}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {r.minValue}–{r.maxValue}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteResource(r.id)}
                className="text-destructive hover:text-destructive"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 pt-2 border-t">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            placeholder="e.g. Gold, Troops"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <div className="w-24 space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            type="number"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={handleAddResource}
          disabled={!newName.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
