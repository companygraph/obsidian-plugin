// What the model adds to Obsidian's graph view and backlinks pane. Both are drawn from one map in
// Obsidian's metadata cache, note path to the paths it links to with a count; read from the
// installed application. Pure: the map is handed in and changed in place, so that it can be
// tested here and handed Obsidian's own in main.ts.
import type { Graph } from "companygraph-meta-model/instance";

export type Links = Record<string, Record<string, number>>;

// One link per edge the parser draws, from the file of the entity that names to the file of the
// entity named. A qualifier draws no edge in the model and none here.
export function linksOf(graph: Graph): Links {
  const pathOf = new Map(graph.entities.map((e) => [e.id, e.path]));
  const out: Links = {};
  for (const edge of graph.edges as { from: string; to: string }[]) {
    const from = pathOf.get(edge.from), to = pathOf.get(edge.to);
    if (!from || !to || from === to) continue;
    out[from] ??= {};
    out[from][to] = (out[from][to] ?? 0) + 1;
  }
  return out;
}

// What was added to one note's entry, and the entry it was added to.
export type Added = Map<string, { entry: Record<string, number>; counts: Record<string, number> }>;

// Takes back what `before` added, where the entry is still the one it was added to, and adds
// `mine` to the entries Obsidian has. Obsidian's own counts are never replaced: an entry Obsidian
// has since rebuilt for a note is a new object and is left as Obsidian made it, and a note it has
// no entry for, one renamed or deleted a moment ago, is not given one. Returns what it added.
export function merge(resolved: Links, mine: Links, before: Added): Added {
  for (const path of before.keys()) takeBack(resolved, before, path);
  const added: Added = new Map();
  for (const path of Object.keys(mine)) give(resolved, mine, added, path);
  return added;
}

// The same for one note, whose entry Obsidian has just rebuilt; `added` is updated in place.
export function mergePath(resolved: Links, mine: Links, added: Added, path: string) {
  takeBack(resolved, added, path);
  added.delete(path);
  give(resolved, mine, added, path);
}

// A note renamed: Obsidian moves its entry, the same object, to the new path, so what was added
// to it and the model's links from and to it move with it. Both are updated in place.
export function rename(mine: Links, added: Added, from: string, to: string) {
  const was = added.get(from);
  if (was) { added.delete(from); added.set(to, was); }
  if (mine[from]) { mine[to] = mine[from]; delete mine[from]; }
  for (const targets of Object.values(mine))
    if (from in targets) { targets[to] = (targets[to] ?? 0) + targets[from]; delete targets[from]; }
}

function takeBack(resolved: Links, added: Added, path: string) {
  const was = added.get(path);
  if (!was || resolved[path] !== was.entry) return;
  for (const [to, n] of Object.entries(was.counts)) {
    const left = (was.entry[to] ?? 0) - n;
    if (left > 0) was.entry[to] = left;
    else delete was.entry[to];
  }
}

function give(resolved: Links, mine: Links, added: Added, path: string) {
  const entry = resolved[path];
  const targets = mine[path];
  if (!entry || !targets) return;
  for (const [to, n] of Object.entries(targets)) entry[to] = (entry[to] ?? 0) + n;
  added.set(path, { entry, counts: { ...targets } });
}
