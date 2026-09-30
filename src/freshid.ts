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
// without frontmatter, frontmatter holding the id alone, as the package's `withId` writes it. A
// carriage return at a line's end stays where it is.
export function freshIdChange(text: string, id: string): { from: number; to: number; insert: string } {
  const lines: { from: number; text: string; eol: string }[] = [];
  const re = /([^\r\n]*)(\r?\n|$)/g;
  let found: RegExpExecArray | null;
  while ((found = re.exec(text)) && found.index < text.length) {
    lines.push({ from: found.index, text: found[1], eol: found[2] });
    if (!found[2]) break;
  }
  const end = lines[0]?.text === "---" ? lines.findIndex((l, i) => i > 0 && l.text === "---") : -1;
  if (end === -1) return { from: 0, to: 0, insert: `---\nid: ${id}\n---\n\n` };
  for (let i = 1; i < end; i++)
    if (lines[i].text.startsWith("id:"))
      return { from: lines[i].from + 3, to: lines[i].from + lines[i].text.length, insert: ` ${id}` };
  return { from: lines[1].from, to: lines[1].from, insert: `id: ${id}${lines[0].eol}` };
}
