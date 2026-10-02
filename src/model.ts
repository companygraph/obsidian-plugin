// One rebuild: the checks over the whole map, then the parse. Pure.
import { checkInstance, typeOfPath, vocabularyOf } from "companygraph-meta-model/checks";
import { parseInstance } from "companygraph-meta-model/instance";
import type { Graph } from "companygraph-meta-model/instance";
import type { TypeEntry } from "companygraph-meta-model/checks";

export interface Layout {
  core: string;   // where the vendored schemas sit, e.g. "meta/core"
  model: string;  // the container, e.g. "model"
  packs?: Pack[]; // the packs the instance took; none where absent
}

// A pack beside core: its name and the folder its schemas are vendored in, e.g. "meta/software".
export interface Pack {
  name: string;
  dir: string;
}

// Whether a file is one the checks and the parser read: the container, core, or a pack's folder.
export const concerns = (path: string, layout: Layout) =>
  path.startsWith(layout.model + "/") ||
  path.startsWith(layout.core + "/") ||
  (layout.packs ?? []).some((p) => path.startsWith(p.dir + "/"));

// Every type the instance has: core's and its packs', each with the folder or file it sits at.
export const typesOf = (layout: Layout): TypeEntry[] => vocabularyOf({ core: layout.core, packs: layout.packs }).types;

// The type of a note by its path, with the packs' types beside core's.
export const typeOf = (path: string, layout: Layout): string | null => typeOfPath(path, layout.model, typesOf(layout));

// The key a type's schema sits under in `schemasOf`: bare for core's, `<pack>/` for a pack's.
export function schemaKeyOf(type: string, layout: Layout): string | null {
  const entry = vocabularyOf({ core: layout.core, packs: layout.packs }).types.find((t) => t.type === type);
  if (!entry) return null;
  return entry.unit === "core" ? `${type}-schema.md` : `${entry.unit}/${type}-schema.md`;
}

// The vault as the checks take it: a path to its text, or to its bytes where the file is an
// image (R9). Only the checks and `locate` read this; everything that edits a note reads `textOf`.
export type Files = Map<string, string | Uint8Array>;

// The text of a map: every file but the images, which nothing that edits a note may meet as
// a string it could split, search or rewrite.
export function textOf(files: Files): Map<string, string> {
  const text = new Map<string, string>();
  for (const [path, held] of files) if (typeof held === "string") text.set(path, held);
  return text;
}

export interface Model {
  failures: string[];
  skipped: string[];
  graph: Graph | null;
  schemas: Map<string, string>;
}

export function schemasOf(files: Files, layout: Layout): Map<string, string> {
  const schemas = new Map<string, string>();
  const prefix = layout.core + "/";
  for (const [path, text] of files)
    if (typeof text === "string" && path.startsWith(prefix) && path.endsWith("-schema.md")) schemas.set(path.slice(prefix.length), text);
  // A pack's schemas are keyed `<pack>/<file>`, which is how the parser addresses them.
  for (const pack of layout.packs ?? []) {
    const dir = pack.dir + "/";
    for (const [path, text] of files)
      if (typeof text === "string" && path.startsWith(dir) && path.endsWith("-schema.md")) schemas.set(`${pack.name}/${path.slice(dir.length)}`, text);
  }
  return schemas;
}

export function buildModel(files: Files, layout: Layout): Model {
  const { failures, skipped } = checkInstance(files, layout);
  const schemas = schemasOf(files, layout);
  const content = new Map<string, string>();
  const prefix = layout.model + "/";
  for (const [path, text] of files)
    if (typeof text === "string" && path.startsWith(prefix) && path.endsWith(".md")) content.set(path.slice(prefix.length), text);
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
