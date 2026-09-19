// Rename entity and Delete entity (spec §8): what either would change, worked out before anything
// is written. A reference to an entity is a span a schema declares as one that resolves to it,
// resolved as the checks resolve, by the declared type and, for an owned type, within the owner
// it is written in, in a field, a table cell or a `###` heading of a section its schema declares
// grouped. A name in prose is a fact and is left as written. Pure: the vault's files, the
// vocabulary and the parsed names in, a plan out.
import { TYPES, slug, typeOfPath } from "companygraph-meta-model/checks";
import type { TypeVocabulary } from "./vocabulary.ts";
import { referencesIn, resolveIn } from "./references.ts";
import { visibleIn } from "./scope.ts";
import type { Named } from "./scope.ts";

export interface Mention { path: string; line: number; from: number; to: number }
export interface Move { from: string; to: string }

// Every span in the model that names `target`.
export function referencesTo(
  files: Map<string, string>,
  vocabulary: Map<string, TypeVocabulary>,
  named: Named[],
  model: string,
  target: Named,
): Mention[] {
  const out: Mention[] = [];
  for (const [path, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!path.startsWith(`${model}/`) || !path.endsWith(".md")) continue;
    const type = typeOfPath(path, model);
    const v = type ? vocabulary.get(type) : undefined;
    if (!v) continue;
    const lines = text.split("\n");
    for (const ref of referencesIn(lines, v))
      if (ref.target === target.type && ref.name === target.name && resolveIn(named, path, model, ref.target, ref.name) === target.path)
        out.push({ path, line: ref.line, from: ref.from, to: ref.to });
  }
  return out;
}

// A file's text with spans replaced, the last first so that earlier offsets stay true.
function replaced(text: string, spans: Mention[], by: string): string {
  const lines = text.split("\n");
  for (const m of [...spans].sort((a, b) => b.line - a.line || b.from - a.from))
    lines[m.line] = lines[m.line].slice(0, m.from) + by + lines[m.line].slice(m.to);
  return lines.join("\n");
}

// The H1 line of a text, below the frontmatter, as the parser reads it; -1 where there is none.
function h1Line(lines: string[]): number {
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end !== -1) start = end + 1;
  }
  return lines.findIndex((l, i) => i >= start && l.startsWith("# "));
}

type Kind = "singular" | "owner" | "chosen" | "derived";

function kindOf(type: string): Kind | null {
  const t = TYPES.find((x) => x.type === type);
  if (!t) return null;
  if (t.file) return "singular";
  if (t.filename) return "chosen";
  if (t.folder?.split("/").pop()?.startsWith("<")) return "owner";
  return "derived";
}

export type RenamePlan =
  | { refused: string }
  | { name: string; texts: Map<string, string>; moves: Move[]; mentions: Mention[] };

export function renamePlan(
  files: Map<string, string>,
  vocabulary: Map<string, TypeVocabulary>,
  named: Named[],
  model: string,
  target: Named,
  newName: string,
): RenamePlan {
  const name = newName.trim();
  const kind = kindOf(target.type);
  if (!kind) return { refused: `${target.type} is not a type this plugin knows.` };
  if (!name || !slug(name)) return { refused: "The new name has no letter or digit to name a file by." };
  if (name === target.name) return { refused: "The new name is the name it has." };
  // A name is written into table cells and frontmatter values as it stands, so it may hold
  // nothing either reads as its own: a pipe splits a cell; a quote at either end, a bracket, a
  // `#`, `-`, `>`, `&`, `*`, `!`, `%` or `@` at the start, `: ` or ` #` inside, are YAML's.
  if (/\||: | #|^["'\[{#\->&*!%@`]|["']$/.test(name) || /[\r\n]/.test(name))
    return { refused: "A name may hold no pipe, no quote at either end, no `: ` or ` #`, and may not open with a sign YAML reads as its own." };
  // R2: unique within its type, and for an owned type within its owner.
  if (visibleIn(named, target.path, model).some((n) => n.type === target.type && n.name === name && n.path !== target.path))
    return { refused: `Another ${target.type} is named "${name}" already.` };
  const own = files.get(target.path);
  if (own === undefined) return { refused: `${target.path} is not in the vault.` };
  const at = h1Line(own.split("\n"));
  if (at === -1) return { refused: `${target.path} has no H1 to rename.` };

  const mentions = referencesTo(files, vocabulary, named, model, target);
  const texts = new Map<string, string>();
  const byPath = new Map<string, Mention[]>();
  for (const m of mentions) byPath.set(m.path, [...(byPath.get(m.path) ?? []), m]);
  for (const [path, spans] of byPath) texts.set(path, replaced(files.get(path)!, spans, name));
  const lines = (texts.get(target.path) ?? own).split("\n");
  lines[at] = `# ${name}`;
  texts.set(target.path, lines.join("\n"));

  const moves: Move[] = [];
  const dir = target.path.slice(0, target.path.lastIndexOf("/"));
  const base = slug(name);
  if (kind === "owner") {
    const parent = dir.slice(0, dir.lastIndexOf("/"));
    const oldBase = dir.slice(dir.lastIndexOf("/") + 1);
    if (oldBase !== base) {
      const folder = `${parent}/${base}`;
      if ([...files.keys()].some((p) => p.startsWith(`${folder}/`))) return { refused: `${folder}/ exists already.` };
      moves.push({ from: dir, to: folder }, { from: `${folder}/${oldBase}.md`, to: `${folder}/${base}.md` });
    }
  } else if (kind === "derived") {
    const to = `${dir}/${base}.md`;
    if (to !== target.path) {
      if (files.has(to)) return { refused: `${to} exists already.` };
      moves.push({ from: target.path, to });
    }
  }
  // A singular type's file is fixed, and a chosen filename is the author's, so neither moves.
  return { name, texts, moves, mentions };
}

// What deleting an entity removes and what it leaves naming nothing. An owner goes with its folder
// and every entity it owns; the references that stop resolving are those outside what is removed.
// A singular type's file is one the container must hold, so it is refused.
export type DeletePlan = { refused: string } | { remove: string; removed: string[]; mentions: Mention[] };

export function deletePlan(
  files: Map<string, string>,
  vocabulary: Map<string, TypeVocabulary>,
  named: Named[],
  model: string,
  target: Named,
): DeletePlan {
  const kind = kindOf(target.type);
  if (kind === "singular") return { refused: `The model holds exactly one ${target.type}; its file cannot be deleted.` };
  const owner = kind === "owner";
  const remove = owner ? target.path.slice(0, target.path.lastIndexOf("/")) : target.path;
  const removed = owner ? [...files.keys()].filter((p) => p.startsWith(`${remove}/`)).sort() : [target.path];
  const gone = named.filter((n) => removed.includes(n.path));
  const mentions = gone
    .flatMap((n) => referencesTo(files, vocabulary, named, model, n))
    .filter((m) => !removed.includes(m.path));
  return { remove, removed, mentions };
}
