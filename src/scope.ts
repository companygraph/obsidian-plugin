// Which names a file may use. Core 0.30.1 holds a name of an owned type, written inside an owner
// or in an entity the same owner owns, to that owner's own folder of the owned type; completion
// offers what the checks will accept, so there it offers that owner's names and no one else's.
// Every other type is offered whole. What is owned by what is read from the package's own list
// of types, never restated here. Pure.
import { TYPES } from "companygraph-meta-model/checks";
import type { Graph } from "companygraph-meta-model/instance";

// `id` is the parser's own id for the entity (every graph entity carries one), passed through so
// the package's `rowScope`/`resolveRow` can check a folder-form reading of an owner's path against
// it: without an id, a plain-file owner whose own name happens to equal its containing folder's —
// `profiles/profiles.md`, a profile named "profiles" filed directly under `profiles/` — reads as
// if it owned that folder, which puts everyone else's owned entities in its scope too.
export interface Named { type: string; name: string; path: string; id: string }

// The entities of a graph that parsed, as completion needs them: type, canonical name, where, id.
export function namedOf(graph: Graph): Named[] {
  return graph.entities.filter((e) => e.name !== "").map((e) => ({ type: e.type, name: e.name, path: e.path, id: e.id }));
}

const sorted = (names: Iterable<string>) => [...new Set(names)].sort((a, b) => a.localeCompare(b));

// The entities a file at `path`, under the container `model`, may name: of an owned type, those
// of the owner the file is in, and of every other type, all of them.
export function visibleIn(named: Named[], path: string, model: string): Named[] {
  // An owner's subtree is `<container>/<owner folder>/<owner>/`: every owner the conventions
  // allow sits one level under the container, as the checks read it.
  const rel = path.startsWith(`${model}/`) ? path.slice(model.length + 1).split("/") : [];
  const scoped = new Map<string, string>();
  if (rel.length >= 3)
    for (const owned of TYPES) {
      if (!owned.owner || !owned.folder) continue;
      const owner = TYPES.find((t) => t.type === owned.owner);
      if (!owner?.folder || rel[0] !== owner.folder.split("/")[0]) continue;
      scoped.set(owned.type, `${model}/${rel[0]}/${rel[1]}/${owned.folder.split("/").pop()}/`);
    }
  return named.filter((n) => !scoped.has(n.type) || n.path.startsWith(scoped.get(n.type)!));
}

// The names by type that a file at `path` may use.
export function namesIn(named: Named[], path: string, model: string): Map<string, string[]> {
  const byType = new Map<string, string[]>();
  for (const n of named) byType.set(n.type, byType.get(n.type) ?? []);
  for (const n of visibleIn(named, path, model)) byType.get(n.type)!.push(n.name);
  return new Map([...byType].map(([type, names]) => [type, sorted(names)]));
}
