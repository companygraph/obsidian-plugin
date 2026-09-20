// What both views draw (spec §8): the pane's two lists and the section under a note read one
// thing, refs.ts's `References`, and draw it the same way from here. A direction's title carries
// its count, a group's file is shown as a person reads it — a name and a folder underneath, not a
// path — and a mention is its line counted from one, its name, and what declares it. Pure.
import type { Group, References } from "./refs.ts";
import { countOf } from "./refs.ts";

export interface MentionRow {
  line: number;   // counted from one
  name: string;
  declared: string;
  path: string;   // the file the name is written in, to open
}

export interface FileGroup {
  path: string;
  name: string;   // the file's basename, without `.md`
  folder: string; // "" for a file with no folder above it
  mentions: MentionRow[];
}

export interface Direction {
  title: string; // e.g. "Referred to by · 7"
  groups: FileGroup[];
}

export interface ReferencesView {
  in: Direction;
  out: Direction;
}

// A path as a person reads it: the file's own name, and the folder it sits in underneath.
function fileOf(path: string): { name: string; folder: string } {
  const slash = path.lastIndexOf("/");
  return { name: path.slice(slash + 1).replace(/\.md$/, ""), folder: slash > 0 ? path.slice(0, slash) : "" };
}

const groupsOf = (groups: Group[]): FileGroup[] =>
  groups.map((g) => ({
    path: g.path,
    ...fileOf(g.path),
    mentions: g.mentions.map((m) => ({ line: m.line + 1, name: m.name, declared: m.declared, path: m.path })),
  }));

const directionOf = (title: string, groups: Group[]): Direction => ({
  title: `${title} · ${countOf(groups)}`,
  groups: groupsOf(groups),
});

export function viewOf(refs: References): ReferencesView {
  return { in: directionOf("Referred to by", refs.in), out: directionOf("Refers to", refs.out) };
}
