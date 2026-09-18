// Where the cursor is, in the terms completion answers in. Pure: lines and a position in, a
// context or null out. `start` is the column the typed text begins at, which is what a
// candidate replaces.
import { tableOf } from "companygraph-meta-model/checks";

export type Context =
  | { kind: "key"; typed: string; start: number }
  | { kind: "value"; field: string; typed: string; start: number }
  | { kind: "cell"; section: string; column: string; typed: string; start: number }
  | { kind: "heading"; typed: string; start: number };

// The line the frontmatter closes on, or -1 when the file opens with none.
export function frontmatterEnd(lines: string[]): number {
  return lines[0] === "---" ? lines.indexOf("---", 1) : -1;
}

export function contextAt(lines: string[], line: number, ch: number): Context | null {
  const before = (lines[line] ?? "").slice(0, ch);
  const end = frontmatterEnd(lines);

  if (end > 0 && line > 0 && line < end) {
    const item = before.match(/^\s*-\s+(.*)$/);
    if (item) {
      let up = line - 1;
      while (up > 0 && /^\s*-\s/.test(lines[up])) up--;
      const key = lines[up].match(/^([\w-]+):\s*$/)?.[1];
      return key ? { kind: "value", field: key, typed: item[1], start: ch - item[1].length } : null;
    }
    const value = before.match(/^([\w-]+):\s*(.*)$/);
    if (value) return { kind: "value", field: value[1], typed: value[2], start: ch - value[2].length };
    if (/^[\w-]*$/.test(before)) return { kind: "key", typed: before, start: 0 };
    return null;
  }
  if (line <= end) return null;

  const heading = before.match(/^## (.*)$/);
  if (heading) return { kind: "heading", typed: heading[1], start: 3 };

  if (before.trimStart().startsWith("|")) {
    let first = line;
    while (first > 0 && lines[first - 1].trim().startsWith("|")) first--;
    if (line - first < 2) return null; // the header row and the separator row are not cells
    let last = line;
    while (last + 1 < lines.length && lines[last + 1].trim().startsWith("|")) last++;
    let up = first - 1;
    while (up >= 0 && !lines[up].startsWith("## ")) up--;
    if (up < 0) return null;
    // The table is read once, by the package that reads it everywhere else: a table without a
    // valid GFM separator row is not a table, and has no column to be inside.
    const table = tableOf(lines.slice(first, last + 1).join("\n"));
    if (!table) return null;
    const index = before.split("|").length - 2;
    const column = table.columns[index];
    if (!column) return null;
    const typed = before.slice(before.lastIndexOf("|") + 1).trimStart();
    return { kind: "cell", section: lines[up].slice(3).trim(), column, typed, start: ch - typed.length };
  }
  return null;
}
