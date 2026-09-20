// What names this entity, and what it names (spec §8, "References of our own"). Obsidian's own
// backlinks read a file's Markdown links, and the model has none: a reference is a plain name a
// schema declares, resolved by its type and, for an owned type, within its owner. Both lists are
// worked out here, from the vault's files and the last parse, so the pane and the section under a
// note show one thing. Pure.
import { typeOfPath } from "companygraph-meta-model/checks";
import type { TypeVocabulary } from "./vocabulary.ts";
import { referencesIn, resolveIn } from "./references.ts";
import type { Named } from "./scope.ts";

// One name written in one file: where it stands, what declares it, and what it names.
export interface Mention {
  path: string;   // the file the name is written in
  line: number;   // zero-based
  name: string;
  declared: string; // the field, `## Section · Column`, or `## Section` of a grouped heading
  target: string;   // the path of the entity it names
}

export interface Group { path: string; mentions: Mention[] }
export interface References { in: Group[]; out: Group[] }

export interface World {
  files: Map<string, string>;
  vocabulary: Map<string, TypeVocabulary>;
  named: Named[];
  model: string;
}

// Every reference written in one file that resolves, with what declares each.
function mentionsIn(world: World, path: string, text: string): Mention[] {
  const type = typeOfPath(path, world.model);
  const vocabulary = type ? world.vocabulary.get(type) : undefined;
  if (!vocabulary) return [];
  const out: Mention[] = [];
  for (const ref of referencesIn(text.split("\n"), vocabulary)) {
    const target = resolveIn(world.named, path, world.model, ref.target, ref.name);
    if (target) out.push({ path, line: ref.line, name: ref.name, declared: ref.declared, target });
  }
  return out;
}

const grouped = (mentions: Mention[], by: (m: Mention) => string): Group[] => {
  const groups = new Map<string, Mention[]>();
  for (const m of mentions) groups.set(by(m), [...(groups.get(by(m)) ?? []), m]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, ms]) => ({ path, mentions: [...ms].sort((x, y) => x.line - y.line) }));
};

// The two lists for the entity whose file is `path`: what names it, grouped by the file each name
// is written in, and what it names, grouped by the file each name points at. A name written in
// the entity's own file that resolves to itself belongs to neither; nothing in core declares one,
// and a list that showed it would say a thing refers to itself.
export function referencesFor(world: World, path: string): References {
  const incoming: Mention[] = [];
  for (const [from, text] of world.files) {
    if (from === path || !from.startsWith(`${world.model}/`) || !from.endsWith(".md")) continue;
    for (const m of mentionsIn(world, from, text)) if (m.target === path) incoming.push(m);
  }
  const own = world.files.get(path);
  const outgoing = own === undefined ? [] : mentionsIn(world, path, own).filter((m) => m.target !== path);
  return { in: grouped(incoming, (m) => m.path), out: grouped(outgoing, (m) => m.target) };
}

// How many names each list holds, for the status bar and the section's own headings.
export const countOf = (groups: Group[]): number => groups.reduce((n, g) => n + g.mentions.length, 0);
