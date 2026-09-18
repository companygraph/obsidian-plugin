// Where the cursor is, in the terms completion answers in. Pure: lines and a position in, a
// context or null out. `start` is the column the typed text begins at, which is what a
// candidate replaces.
import { tableOf } from "companygraph-meta-model/checks";
import { sectionAbove } from "./tables.ts";

export type Context =
  | { kind: "key"; typed: string; start: number }
  // `item` says which line the value is being written on: an entry of a block sequence, or the
  // key's own line. A list field holds its values on entries alone, and nothing else can tell.
  // `glued` says no space stands between the colon and where the value begins, so whoever
  // inserts there brings one: `source:Local` is one bare word to YAML and no field at all.
  | { kind: "value"; field: string; typed: string; start: number; item: boolean; glued: boolean }
  | { kind: "cell"; section: string; column: string; typed: string; start: number }
  | { kind: "heading"; typed: string; start: number };

// One definition of a fence, for the two readers below.
const fence = (line: string) => line === "---";

// The line the frontmatter closes on, or -1 when the file opens with none.
export function frontmatterEnd(lines: string[]): number {
  if (!fence(lines[0] ?? "")) return -1;
  for (let i = 1; i < lines.length; i++) if (fence(lines[i])) return i;
  return -1;
}

// Whether this position could hold a context at all, decided from single lines. Completion asks
// this on every keypress, before it pays for the whole document: the API's own note on onTrigger
// asks it to be cheap and to return null as early as possible. A heading or a table row is
// decided on its own line; anything else can only be a context inside frontmatter, and a line
// past the closing fence is in the body whatever it reads like.
export function mayHoldContext(getLine: (n: number) => string, line: number, ch: number): boolean {
  const before = (getLine(line) ?? "").slice(0, ch);
  if (before.startsWith("## ") || before.trimStart().startsWith("|")) return true;
  if (!fence(getLine(0) ?? "")) return false;
  for (let i = 1; i < line; i++) if (fence(getLine(i) ?? "")) return false;
  return true;
}

export function contextAt(lines: string[], line: number, ch: number): Context | null {
  const text = lines[line] ?? "";
  const before = text.slice(0, ch);
  const after = text.slice(ch);
  const end = frontmatterEnd(lines);

  if (end > 0 && line > 0 && line < end) {
    // A key or a value both run to the end of the line, so anything but blank after the
    // cursor means it sits inside text, not at the edge completion would extend.
    if (after.trim() !== "") return null;
    const item = before.match(/^\s*-\s+(.*)$/);
    if (item) {
      let up = line - 1;
      while (up > 0 && /^\s*-\s/.test(lines[up])) up--;
      const key = lines[up].match(/^([\w-]+):\s*$/)?.[1];
      return key ? { kind: "value", field: key, typed: item[1], start: ch - item[1].length, item: true, glued: false } : null;
    }
    const value = before.match(/^([\w-]+):(\s*)(.*)$/);
    if (value)
      return { kind: "value", field: value[1], typed: value[3], start: ch - value[3].length, item: false, glued: value[2] === "" };
    if (/^[\w-]*$/.test(before)) return { kind: "key", typed: before, start: 0 };
    return null;
  }
  if (line <= end) return null;

  const heading = before.match(/^## (.*)$/);
  if (heading) return after.trim() === "" ? { kind: "heading", typed: heading[1], start: 3 } : null;

  if (before.trimStart().startsWith("|")) {
    let first = line;
    while (first > 0 && lines[first - 1].trim().startsWith("|")) first--;
    if (line - first < 2) return null; // the header row and the separator row are not cells
    let last = line;
    while (last + 1 < lines.length && lines[last + 1].trim().startsWith("|")) last++;
    const section = sectionAbove(lines, first - 1);
    if (!section) return null;
    // The table is read once, by the package that reads it everywhere else: a table without a
    // valid GFM separator row is not a table, and has no column to be inside.
    const table = tableOf(lines.slice(first, last + 1).join("\n"));
    if (!table) return null;
    const index = before.split("|").length - 2;
    const column = table.columns[index];
    if (!column) return null;
    // Only this cell needs to be blank ahead of the cursor: text in a later cell of the same
    // row is somebody else's completion to make, not a reason to refuse this one.
    const next = after.indexOf("|");
    const rest = next === -1 ? after : after.slice(0, next);
    if (rest.trim() !== "") return null;
    const typed = before.slice(before.lastIndexOf("|") + 1).trimStart();
    return { kind: "cell", section, column, typed, start: ch - typed.length };
  }
  return null;
}
