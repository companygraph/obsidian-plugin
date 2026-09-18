// One rebuild: the checks over the whole map, then the parse. Pure.
import { checkInstance } from "companygraph-meta-model/checks";
import { parseInstance } from "companygraph-meta-model/instance";
import type { Graph } from "companygraph-meta-model/instance";

export interface Layout {
  core: string;   // where the vendored schemas sit, e.g. "meta/core"
  model: string;  // the container, e.g. "model"
}

export interface Model {
  failures: string[];
  skipped: string[];
  graph: Graph | null;
  schemas: Map<string, string>;
}

export function schemasOf(files: Map<string, string>, layout: Layout): Map<string, string> {
  const schemas = new Map<string, string>();
  const prefix = layout.core + "/";
  for (const [path, text] of files)
    if (path.startsWith(prefix) && path.endsWith("-schema.md")) schemas.set(path.slice(prefix.length), text);
  return schemas;
}

export function buildModel(files: Map<string, string>, layout: Layout): Model {
  const { failures, skipped } = checkInstance(files, layout);
  const schemas = schemasOf(files, layout);
  const content = new Map<string, string>();
  const prefix = layout.model + "/";
  for (const [path, text] of files)
    if (path.startsWith(prefix) && path.endsWith(".md")) content.set(path.slice(prefix.length), text);
  let graph: Graph | null = null;
  try {
    graph = parseInstance(content, { sub: prefix, schemas });
  } catch (error) {
    // The checks are the fuller report of what the parser throws on. Its message is shown only
    // when they found nothing and it threw all the same.
    if (failures.length === 0) failures.push(error instanceof Error ? error.message : String(error));
  }
  return { failures, skipped, graph, schemas };
}

// The canonical names of every type, sorted, from a graph that parsed.
export function namesByType(graph: Graph): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const e of graph.entities) {
    // An empty note in a type folder parses as an entity with no name, and the checks say so.
    // Offered, it sorts first and inserts nothing, so completion opens on a blank row.
    if (e.name === "") continue;
    if (!names.has(e.type)) names.set(e.type, []);
    names.get(e.type)!.push(e.name);
  }
  for (const list of names.values()) list.sort((a, b) => a.localeCompare(b));
  return names;
}
