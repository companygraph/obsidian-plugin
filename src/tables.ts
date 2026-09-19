// A table in Live Preview. There Obsidian draws a table as its own widget and edits one cell at
// a time in a small editor of its own, whose text is the cell's alone, so there is no row of
// pipes to count; which row and column the cell is comes from Obsidian's table object instead.
// This module decides what those facts mean. Pure: the Obsidian-facing modules only fetch them.
import { tableOf } from "companygraph-meta-model/checks";
import type { Context } from "./context.ts";

// The `## ` section a line sits under, or null when none stands above it. It reads one line at
// a time, because completion asks on every keypress and a note should not be stringified for it.
export function sectionAbove(getLine: (n: number) => string | undefined, line: number): string | null {
  for (let up = line; up >= 0; up--) {
    const text = getLine(up);
    if (text?.startsWith("## ")) return text.slice(3).trim();
  }
  return null;
}

export interface CellFacts {
  table: string;          // the table's own lines in the note, as text
  row: number;            // 0 is the header row; the separator row is not a row
  col: number;
  section: string | null; // the section the table sits under
  lines: number;          // how many lines the cell's own editor holds
  line: string;           // the cursor's line in the cell's own editor
  ch: number;
}

// The completion context of a cell being edited in the widget: the same context Source mode
// reaches by reading pipes. Obsidian says which row and column the cell is; what the column is
// called is read from the note by the package's tableOf, as Source mode reads it, so the two
// name a column alike and a table the package does not read as one gives no context in either.
export function cellContextOf(facts: CellFacts): Context | null {
  if (facts.row < 1 || !facts.section) return null;
  const column = tableOf(facts.table)?.columns[facts.col];
  if (!column) return null;
  // A cell holding `<br>` is several lines in its editor and one in the note; Source mode sees
  // the whole of it on one line, and a name inserted into part of it would not be what was meant.
  if (facts.lines !== 1) return null;
  // As in a line of text: anything but blank after the cursor means it sits inside text.
  if (facts.line.slice(facts.ch).trim() !== "") return null;
  const typed = facts.line.slice(0, facts.ch).trimStart();
  return { kind: "cell", section: facts.section, column, typed, start: facts.ch - typed.length };
}

export type TableRow = { kind: "header" } | { kind: "body"; index: number };

// Which row of the drawn table a failing line is. `first` is the table's first line and `lines`
// how many it spans: header, separator, then the body. The separator is drawn as no row of its
// own, so a failure on it, which only a malformed table produces, is shown on the header.
export function tableRowOf(line: number, first: number, lines: number): TableRow | null {
  const at = line - first;
  if (at < 0 || at >= lines) return null;
  return at < 2 ? { kind: "header" } : { kind: "body", index: at - 2 };
}

// The cell of a drawn table a failure on `line` is in, for the pane to open it: the table's first
// line, the row as Obsidian's table counts it, the header being 0 and the separator no row, and
// the column the failure's message names in backticks, as the checks name a column; the first
// column where it names none. Null when the line is in no table the package reads as one.
export function cellOfFailure(lines: string[], line: number, message: string): { first: number; row: number; col: number } | null {
  if (!(lines[line] ?? "").trimStart().startsWith("|")) return null;
  let first = line;
  while (first > 0 && lines[first - 1].trimStart().startsWith("|")) first--;
  let last = line;
  while (last + 1 < lines.length && lines[last + 1].trimStart().startsWith("|")) last++;
  const columns = tableOf(lines.slice(first, last + 1).join("\n"))?.columns;
  if (!columns) return null;
  const at = line - first;
  const named = [...message.matchAll(/`([^`]+)`/g)].map((m) => m[1]).find((name) => columns.includes(name));
  return { first, row: at < 2 ? 0 : at - 1, col: named ? columns.indexOf(named) : 0 };
}
