// Obsidian's table widget in Live Preview, reached where the plugin API does not: read from the
// installed application, the view's editing mode holds `tableCell` while a cell is edited, with
// the cell (`row`, `col`, `text`), the table (`rows`, whose first is the header, and `start`, its
// offset in the note) and the cell's own editor, which is the editor Obsidian triggers a suggest
// with. None of it is in the public types, so every step is optional: if any of it changes,
// completion and the tint stop inside tables and nothing else does.
import { MarkdownView } from "obsidian";
import type { App, Editor } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { sectionAbove, tableRowOf } from "./tables.ts";
import type { CellFacts } from "./tables.ts";
import type { Mark } from "./marks.ts";

interface NativeCell { row?: unknown; col?: unknown; text?: unknown }
interface NativeTableCell { editor?: unknown; cell?: NativeCell; table?: { rows?: unknown; start?: unknown } }

// What is known of the cell whose own editor this is, without the cursor; null when this editor
// is no cell's, which is every editor but a table cell's in Live Preview.
export function editedCell(app: App, editor: Editor): Omit<CellFacts, "line" | "ch"> | null {
  let facts: Omit<CellFacts, "line" | "ch"> | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (facts || !(leaf.view instanceof MarkdownView)) return;
    const native = (leaf.view as unknown as { editMode?: { tableCell?: NativeTableCell } }).editMode?.tableCell;
    if (!native || native.editor !== editor) return;
    const { cell, table } = native;
    const rows = table?.rows;
    if (typeof cell?.row !== "number" || typeof cell.col !== "number") return;
    if (!Array.isArray(rows) || !Array.isArray(rows[0]) || typeof table?.start !== "number") return;
    const header = (rows[0] as NativeCell[]).map((c) => (typeof c?.text === "string" ? c.text : ""));
    const note = leaf.view.editor;
    const first = note.offsetToPos(table.start).line;
    facts = { header, row: cell.row, col: cell.col, section: sectionAbove(note.getValue().split("\n"), first) };
  });
  return facts;
}

// A failing line inside a table has no text line to be marked on in Live Preview, so the row of
// the drawn table is tinted, with the message as its tooltip. The widget is found by the markup
// themes style it by and placed in the note by CodeMirror's own posAtDOM. A class on a row and
// not a stylesheet rule, since nothing in the markup tells one table of a note from another;
// the widget redraws on a structural edit, and the next repaint puts the class back.
export function tintRows(view: MarkdownView, cm: EditorView | undefined, marks: Mark[]) {
  const root = view.containerEl;
  for (const old of Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget tr.companygraph-mark"))) {
    old.removeClass("companygraph-mark");
    old.removeAttribute("title");
  }
  if (!cm || marks.length === 0) return;
  for (const widget of Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget"))) {
    let first: number;
    try {
      first = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
    } catch {
      continue; // a widget CodeMirror no longer knows
    }
    const rows = Array.from(widget.querySelectorAll<HTMLElement>("tr"));
    for (const mark of marks) {
      const row = tableRowOf(mark.line, first, rows.length + 1); // the separator is a line and no row
      if (!row) continue;
      const tr = row.kind === "header" ? rows[0] : rows[row.index + 1];
      if (!tr) continue;
      tr.addClass("companygraph-mark");
      tr.setAttribute("title", [tr.getAttribute("title"), mark.message].filter(Boolean).join("\n"));
    }
  }
}
