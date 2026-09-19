// Which names a file may use. Core 0.30.1 holds a name of an owned type, written inside an owner
// or in an entity the same owner owns, to that owner's own folder of the owned type; completion
// offers what the checks will accept, so there it offers that owner's names and no one else's.
// Every other type is offered whole. What is owned by what is read from the package's own list
// of types, never restated here. Pure.
import { TYPES } from "companygraph-meta-model/checks";
import type { Graph } from "companygraph-meta-model/instance";

export interface Named { type: string; name: string; path: string }

// The entities of a graph that parsed, as completion needs them: type, canonical name, where.
export function namedOf(graph: Graph): Named[] {
  return graph.entities.filter((e) => e.name !== "").map((e) => ({ type: e.type, name: e.name, path: e.path }));
}

const sorted = (names: Iterable<string>) => [...new Set(names)].sort((a, b) => a.localeCompare(b));

// The names by type that a file at `path` may use, under the container `model`.
export function namesIn(named: Named[], path: string, model: string): Map<string, string[]> {
  const byType = new Map<string, string[]>();
  for (const n of named) byType.set(n.type, [...(byType.get(n.type) ?? []), n.name]);
  const out = new Map([...byType].map(([type, names]) => [type, sorted(names)]));

  // An owner's subtree is `<container>/<owner folder>/<owner>/`: every owner the conventions
  // allow sits one level under the container, as the checks read it.
  const rel = path.startsWith(`${model}/`) ? path.slice(model.length + 1).split("/") : [];
  if (rel.length < 3) return out;
  for (const owned of TYPES) {
    if (!owned.owner || !owned.folder) continue;
    const owner = TYPES.find((t) => t.type === owned.owner);
    if (!owner?.folder || rel[0] !== owner.folder.split("/")[0]) continue;
    const folder = `${model}/${rel[0]}/${rel[1]}/${owned.folder.split("/").pop()}/`;
    out.set(owned.type, sorted(named.filter((n) => n.type === owned.type && n.path.startsWith(folder)).map((n) => n.name)));
  }
  return out;
}
