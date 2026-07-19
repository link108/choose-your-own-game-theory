import assert from "node:assert/strict";
import test from "node:test";
import type { PlaythroughListItem } from "../api.ts";
import { groupPlaythroughs } from "./playthroughs.ts";

const run = (id: string, status: string): PlaythroughListItem => ({
  id,
  scenario_id: `scenario-${id}`,
  scenario_title: `Scenario ${id}`,
  role_name: "Player",
  status,
  created_at: "2026-07-19T12:00:00Z",
  completed_at: status === "completed" ? "2026-07-19T13:00:00Z" : null,
  turn_count: 3,
});

test("groups resumable runs separately while retaining all prior runs", () => {
  const groups = groupPlaythroughs([
    run("new-active", "active"),
    run("completed", "completed"),
    run("old-active", "active"),
    run("abandoned", "abandoned"),
  ]);

  assert.deepEqual(groups.active.map((item) => item.id), ["new-active", "old-active"]);
  assert.deepEqual(groups.previous.map((item) => item.id), ["completed", "abandoned"]);
});
