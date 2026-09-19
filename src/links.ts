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
// `mine`. Obsidian's own counts are never replaced: an entry Obsidian has since rebuilt for a note
// is a new object and is left as Obsidian made it. Returns what it added, for the next call.
export function merge(resolved: Links, mine: Links, before: Added): Added {
  for (const [path, { entry, counts }] of before) {
    if (resolved[path] !== entry) continue;
    for (const [to, n] of Object.entries(counts)) {
      const left = (entry[to] ?? 0) - n;
      if (left > 0) entry[to] = left;
      else delete entry[to];
    }
  }
  const added: Added = new Map();
  for (const [path, targets] of Object.entries(mine)) {
    const entry = (resolved[path] ??= {});
    for (const [to, n] of Object.entries(targets)) entry[to] = (entry[to] ?? 0) + n;
    added.set(path, { entry, counts: { ...targets } });
  }
  return added;
}
