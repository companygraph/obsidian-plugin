// What both views draw (spec §8): the pane's two lists and the section under a note read one
// thing, refs.ts's `References`, and draw it the same way from here. A direction's title carries
// its count, a group's file is shown as a person reads it — a name and a folder underneath, not a
// path — and a mention is its line counted from one, its name, and what declares it. Pure.
import type { Group, References } from "./refs.ts";
import { countOf } from "./refs.ts";

export interface MentionRow {
  // The line the name is written on, counted from one; null where the row opens another note and
  // its own line would name a place in that one.
  line: number | null;
  name: string;
  declared: string;
  path: string;   // the file a click opens
  at: number;     // the line a click lands on, counted from zero
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

// Where a row leads. A name written elsewhere leads to the line it is written on; a name written
// here leads to the entity it names, whose own file the group is, since the line it stands on is
// the one the reader is already looking at.
const groupsOf = (groups: Group[], outgoing: boolean): FileGroup[] =>
  groups.map((g) => ({
    path: g.path,
    ...fileOf(g.path),
    mentions: g.mentions.map((m) => ({
      line: outgoing ? null : m.line + 1,
      name: m.name,
      declared: m.declared,
      path: outgoing ? m.target : m.path,
      at: outgoing ? 0 : m.line,
    })),
  }));

const directionOf = (title: string, groups: Group[], outgoing: boolean): Direction => ({
  title: `${title} · ${countOf(groups)}`,
  groups: groupsOf(groups, outgoing),
});

export function viewOf(refs: References): ReferencesView {
  return { in: directionOf("Referred to by", refs.in, false), out: directionOf("Refers to", refs.out, true) };
}
