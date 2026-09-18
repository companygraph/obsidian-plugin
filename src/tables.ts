// A table in Live Preview. There Obsidian draws a table as its own widget and edits one cell at
// a time in a small editor of its own, whose text is the cell's and holds no pipe to count; the
// cell's row and column and the table's header come from Obsidian's table object instead. This
// module decides what those facts mean. Pure: the Obsidian-facing modules only fetch them.
import type { Context } from "./context.ts";

// The `## ` section a line sits under, or null when none stands above it.
export function sectionAbove(lines: string[], line: number): string | null {
  for (let up = Math.min(line, lines.length - 1); up >= 0; up--)
    if (lines[up].startsWith("## ")) return lines[up].slice(3).trim();
  return null;
}

export interface CellFacts {
  header: string[];       // the text of the header row's cells, as Obsidian holds them
  row: number;            // 0 is the header row; the separator row is not a row
  col: number;
  section: string | null; // the section the table sits under
  line: string;           // the cursor's line in the cell's own editor
  ch: number;
}

// The completion context of a cell being edited in the widget: the same context Source mode
// reaches by reading pipes, named by the header's text and never by position.
export function cellContextOf(facts: CellFacts): Context | null {
  if (facts.row < 1 || !facts.section) return null;
  const column = (facts.header[facts.col] ?? "").trim();
  if (!column) return null;
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
