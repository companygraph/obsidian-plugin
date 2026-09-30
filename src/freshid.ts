// Give this page a fresh id (spec §8): the one way the plugin changes an id, on the author's word.
// Where it is offered and what it writes are decided here; the command and its confirmation are
// main.ts's and entitycommands.ts's. Pure.
import { idFormatOf } from "companygraph-meta-model/ids";
import type { Identifier } from "./scaffold.ts";

// Offered where the plugin may make an id, as the scaffold makes one: the type's schema declares
// `id`, and the instance's `model/identifier.md` declares UUID version 7 or is not there (null).
// A declared pattern is the instance's own, and the tooling makes only UUID version 7 ids. An
// identifier file that does not read, or has not been read yet (undefined), offers nothing.
export function freshIdOffered(declaresId: boolean, identifier: Identifier | undefined): boolean {
  if (!declaresId || identifier === undefined) return false;
  if (identifier === null) return true;
  if (typeof identifier !== "string") return false;
  return idFormatOf(identifier).format === "uuidv7";
}

// The one change that gives a page the id `id`: the value of its frontmatter's `id:` line, a
// comment or quotes with it; for a page without the line, a first frontmatter line; for a page
// without frontmatter, frontmatter holding the id alone, as the package's `withId` writes it.
// The editor's text has newlines alone, but Reading view writes the file's own text, whose lines
// may end in a carriage return and a newline: a line is read without its carriage return, and
// what is written ends as the page's first line does, so no other byte of the page changes and
// a first line read as `---\r` does not make a second frontmatter.
export function freshIdChange(text: string, id: string): { from: number; to: number; insert: string } {
  const raw = text.split("\n");
  const lines = raw.map((l) => l.replace(/\r$/, ""));
  const eol = raw[0] !== lines[0] ? "\r\n" : "\n";
  const end = lines[0] === "---" ? lines.findIndex((l, i) => i > 0 && l === "---") : -1;
  if (end === -1) return { from: 0, to: 0, insert: `---${eol}id: ${id}${eol}---${eol}${eol}` };
  const offset = (n: number) => raw.slice(0, n).reduce((sum, l) => sum + l.length + 1, 0);
  for (let i = 1; i < end; i++)
    if (lines[i].startsWith("id:")) return { from: offset(i) + 3, to: offset(i) + lines[i].length, insert: ` ${id}` };
  return { from: offset(1), to: offset(1), insert: `id: ${id}${eol}` };
}

// The text a page has once given the id `id`.
export function withFreshId(text: string, id: string): string {
  const change = freshIdChange(text, id);
  return text.slice(0, change.from) + change.insert + text.slice(change.to);
}
