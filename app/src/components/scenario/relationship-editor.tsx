"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActorData, RelationshipData } from "./types";

const RELATIONSHIP_TYPES = [
  "ally",
  "rival",
  "neutral",
  "vassal",
  "overlord",
  "trade_partner",
];

interface RelationshipEditorProps {
  actors: ActorData[];
  onUpdate: () => void;
}

export function RelationshipEditor({ actors, onUpdate }: RelationshipEditorProps) {
  const [fromActorId, setFromActorId] = useState("");
  const [toActorId, setToActorId] = useState("");
  const [adding, setAdding] = useState(false);

  // Collect all relationships
  const allRelationships: (RelationshipData & {
    fromActorName: string;
    toActorName: string;
  })[] = [];
  for (const actor of actors) {
    for (const rel of actor.relationshipsFrom) {
      const toActor = actors.find((a) => a.id === rel.toActorId);
      allRelationships.push({
        ...rel,
        fromActorName: actor.name,
        toActorName: toActor?.name ?? "Unknown",
      });
    }
  }

  async function handleAdd() {
    if (!fromActorId || !toActorId || fromActorId === toActorId) return;

    // Check if relationship already exists
    const exists = allRelationships.some(
      (r) => r.fromActorId === fromActorId && r.toActorId === toActorId
    );
    if (exists) return;

    setAdding(true);
    try {
      await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromActorId, toActorId }),
      });

      // Also create the reverse relationship if it doesn't exist
      const reverseExists = allRelationships.some(
        (r) => r.fromActorId === toActorId && r.toActorId === fromActorId
      );
      if (!reverseExists) {
        await fetch("/api/relationships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromActorId: toActorId,
            toActorId: fromActorId,
          }),
        });
      }

      setFromActorId("");
      setToActorId("");
      onUpdate();
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdateRelationship(
    relId: string,
    field: string,
    value: string | number
  ) {
    await fetch(`/api/relationships/${relId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    onUpdate();
  }

  async function handleDeleteRelationship(relId: string) {
    await fetch(`/api/relationships/${relId}`, { method: "DELETE" });
    onUpdate();
  }

  if (actors.length < 2) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Add at least 2 actors before setting up relationships.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define how actors relate to each other. Each direction is independent.
      </p>

      {allRelationships.length > 0 && (
        <div className="space-y-3">
          {allRelationships.map((rel) => (
            <Card key={rel.id}>
              <CardContent className="py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {rel.fromActorName} → {rel.toActorName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRelationship(rel.id)}
                      className="text-destructive hover:text-destructive h-7"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-40">
                      <Select
                        defaultValue={rel.type}
                        onValueChange={(v) =>
                          v && handleUpdateRelationship(rel.id, "type", v)
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIP_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <Label className="text-xs whitespace-nowrap">
                        Strength: {rel.strength}
                      </Label>
                      <Slider
                        defaultValue={[rel.strength]}
                        min={0}
                        max={100}
                        step={5}
                        onValueCommitted={(vals) => {
                          const v = Array.isArray(vals) ? vals[0] : vals;
                          handleUpdateRelationship(rel.id, "strength", v);
                        }}
                      />
                    </div>
                  </div>
                  <Input
                    defaultValue={rel.description ?? ""}
                    placeholder="Description (optional)"
                    className="text-sm"
                    onBlur={(e) => {
                      if (e.target.value !== (rel.description ?? ""))
                        handleUpdateRelationship(
                          rel.id,
                          "description",
                          e.target.value
                        );
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add Relationship</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">From</Label>
              <Select value={fromActorId} onValueChange={(v) => v && setFromActorId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select actor..." />
                </SelectTrigger>
                <SelectContent>
                  {actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground pb-2">→</span>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">To</Label>
              <Select value={toActorId} onValueChange={(v) => v && setToActorId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select actor..." />
                </SelectTrigger>
                <SelectContent>
                  {actors
                    .filter((a) => a.id !== fromActorId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAdd}
              disabled={adding || !fromActorId || !toActorId}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
