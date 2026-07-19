import type { PlaythroughListItem } from "../api";

export type PlaythroughGroups = {
  active: PlaythroughListItem[];
  previous: PlaythroughListItem[];
};

export function groupPlaythroughs(runs: PlaythroughListItem[]): PlaythroughGroups {
  return runs.reduce<PlaythroughGroups>(
    (groups, run) => {
      if (run.status === "active") groups.active.push(run);
      else groups.previous.push(run);
      return groups;
    },
    { active: [], previous: [] },
  );
}
