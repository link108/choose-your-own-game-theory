"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import type { ScenarioData, WorldVariableData } from "./types";

interface WorldSetupProps {
  scenario: ScenarioData;
  onSave: () => void;
}

export function WorldSetup({ scenario, onSave }: WorldSetupProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(scenario.name);
  const [description, setDescription] = useState(scenario.description);
  const [worldDescription, setWorldDescription] = useState(
    scenario.worldDescription
  );

  async function handleSaveScenario() {
    setSaving(true);
    try {
      await fetch(`/api/scenarios/${scenario.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, worldDescription }),
      });
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scenario Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worldDescription">World Description</Label>
            <Textarea
              id="worldDescription"
              value={worldDescription}
              onChange={(e) => setWorldDescription(e.target.value)}
              rows={5}
              placeholder="Describe the world — era, geography, politics, key tensions..."
            />
          </div>
          <Button onClick={handleSaveScenario} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <WorldVariablesSection
        scenarioId={scenario.id}
        variables={scenario.worldVariables}
        onUpdate={onSave}
      />
    </div>
  );
}

function WorldVariablesSection({
  scenarioId,
  variables,
  onUpdate,
}: {
  scenarioId: string;
  variables: WorldVariableData[];
  onUpdate: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newType, setNewType] = useState("string");

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/scenarios/${scenarioId}/world-variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          value: newValue,
          type: newType,
        }),
      });
      setNewName("");
      setNewValue("");
      setNewType("string");
      onUpdate();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(variableId: string) {
    await fetch(
      `/api/scenarios/${scenarioId}/world-variables?variableId=${variableId}`,
      { method: "DELETE" }
    );
    onUpdate();
  }

  async function handleUpdate(variable: WorldVariableData, field: string, value: string) {
    await fetch(`/api/scenarios/${scenarioId}/world-variables`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variableId: variable.id, [field]: value }),
    });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>World Variables</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {variables.length > 0 && (
          <div className="space-y-2">
            {variables.map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <Input
                  defaultValue={v.name}
                  className="flex-1"
                  onBlur={(e) => {
                    if (e.target.value !== v.name)
                      handleUpdate(v, "name", e.target.value);
                  }}
                />
                <Input
                  defaultValue={v.value}
                  className="flex-1"
                  onBlur={(e) => {
                    if (e.target.value !== v.value)
                      handleUpdate(v, "value", e.target.value);
                  }}
                />
                <span className="text-xs text-muted-foreground w-16">
                  {v.type}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(v.id)}
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
              placeholder="Variable name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Value</Label>
            <Input
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <div className="w-28 space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
