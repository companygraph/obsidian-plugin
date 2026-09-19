// Obsidian's table widget in Live Preview, reached where the plugin API does not: read from the
// installed application, the view's editing mode holds `tableCell` while a cell is edited, with
// the cell (`row`, `col`), the table (`start` and `end`, its offsets in the note) and the cell's
// own editor, which is the editor Obsidian triggers a suggest with. None of it is in the public
// types, so every step is optional: if any of it changes, completion and the tint stop inside
// tables and nothing else does. The cell's editor holds the cell's text alone, a `\|` of the
// note unescaped to a pipe and a `<br>` to a line break.
import { MarkdownView } from "obsidian";
import type { App, Editor } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { sectionAbove, tableRowOf } from "./tables.ts";
import type { CellFacts } from "./tables.ts";
import type { Mark } from "./marks.ts";

// What a tinted row carries besides its class, and loses again when the tint goes.
const TOOLTIP = ["aria-label", "data-tooltip-position", "data-tooltip-delay"];

interface NativeTableCell { editor?: unknown; cell?: { row?: unknown; col?: unknown }; table?: { start?: unknown; end?: unknown } }

const nativeCell = (view: MarkdownView) =>
  (view as unknown as { editMode?: { tableCell?: NativeTableCell | null } }).editMode?.tableCell ?? null;

// The editor of the cell being edited in this view, or null. A command is handed the note's
// editor, and focusing that one makes Obsidian close the cell, so whoever acts on "the editor"
// asks here first.
export function cellEditorOf(view: MarkdownView): Editor | null {
  const editor = nativeCell(view)?.editor;
  return editor && typeof (editor as Editor).getLine === "function" ? (editor as Editor) : null;
}

// What is known of the cell whose own editor this is, without the cursor; null when this editor
// is no cell's, which is every editor but a table cell's in Live Preview. It reads the table's
// own lines and walks up line by line for the section: this runs on every keypress in a cell.
export function editedCell(app: App, editor: Editor): Omit<CellFacts, "lines" | "line" | "ch"> | null {
  let facts: Omit<CellFacts, "lines" | "line" | "ch"> | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (facts || !(leaf.view instanceof MarkdownView)) return;
    const native = nativeCell(leaf.view);
    if (!native || native.editor !== editor) return;
    const { cell, table } = native;
    if (typeof cell?.row !== "number" || typeof cell.col !== "number") return;
    if (typeof table?.start !== "number" || typeof table.end !== "number") return;
    const note = leaf.view.editor;
    const from = note.offsetToPos(table.start);
    facts = {
      table: note.getRange(from, note.offsetToPos(table.end)),
      row: cell.row,
      col: cell.col,
      section: sectionAbove((n) => note.getLine(n), from.line - 1),
    };
  });
  return facts;
}

// A failing line inside a table has no text line to be marked on in Live Preview, so the row of
// the drawn table is tinted, with the message as its tooltip. The widget is found by the markup
// themes style it by and placed in the note by CodeMirror's own posAtDOM. A class on a row and
// not a stylesheet rule, since nothing in the markup tells one table of a note from another;
// the widget redraws on a structural edit, and the next repaint puts the class back. The rows
// sit inside CodeMirror's content, and writing to them needs no observer.ignore: CodeMirror drops
// a mutation whose nearest view is a block widget (BlockWidgetView.ignoreMutation is true).
// The colour is in styles.css, under a selector that outranks Obsidian's own striping of rows.
export function tintRows(view: MarkdownView, cm: EditorView | undefined, marks: Mark[]) {
  const root = view.containerEl;
  for (const old of Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget tr[data-companygraph]"))) {
    old.removeAttribute("data-companygraph");
    old.removeClass("companygraph-mark");
    for (const name of TOOLTIP) old.removeAttribute(name);
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
      // The attribute is what the clearing above looks for, so a tooltip written here is always
      // one it takes away again, whatever happens to the class. The message is Obsidian's own
      // tooltip, which it shows for any element carrying an aria-label, through one handler on
      // the page: the browser's `title` does not come up inside the table widget, found in use.
      const said = tr.hasAttribute("data-companygraph") ? tr.getAttribute("aria-label") : null;
      tr.setAttribute("data-companygraph", "");
      tr.addClass("companygraph-mark");
      tr.setAttribute("aria-label", [said, mark.message].filter(Boolean).join("\n"));
      tr.setAttribute("data-tooltip-position", "top");
      tr.setAttribute("data-tooltip-delay", "300");
    }
  }
}

// Opens a cell of a drawn table, as a click on it would, for the pane to land a failure in the
// cell it is about. A cursor put on a line inside a table has nowhere to stand in Live Preview,
// and CodeMirror moves it to the end of the widget, the last row. Read from the installed
// application: the widget is CodeMirror's own widget object, reached from its element through
// the tile CodeMirror keeps on it (`cmTile`, `cmView` in older releases), and it opens a cell by
// `receiveCellFocus(row, col)`, rows counted from the header. None of it is in the public
// types: where any of it is missing, the row is scrolled to the middle of the view instead.
// True when a table was found at `first`.
export function openCell(view: MarkdownView, cm: EditorView, first: number, row: number, col: number, ch?: number): boolean {
  for (const el of Array.from(view.containerEl.querySelectorAll<HTMLElement>(".cm-table-widget"))) {
    let at: number;
    try {
      at = cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1;
    } catch {
      continue;
    }
    if (at !== first) continue;
    const tile = (el as unknown as { cmTile?: { widget?: unknown }; cmView?: { widget?: unknown } }).cmTile
      ?? (el as unknown as { cmView?: { widget?: unknown } }).cmView;
    // The third argument, read from the installed application, gives the cell's own editor a
    // selection once it is open; `ch` puts the cursor that far into the cell's text.
    const widget = tile?.widget as
      | { receiveCellFocus?: (row: number, col: number, select?: (cell: EditorView) => { anchor: number }) => unknown }
      | undefined;
    if (typeof widget?.receiveCellFocus === "function") {
      try {
        if (ch === undefined) widget.receiveCellFocus(row, col);
        else widget.receiveCellFocus(row, col, (cell) => ({ anchor: Math.min(ch, cell.state.doc.length) }));
        return true;
      } catch {
        // fall through to the scroll
      }
    }
    el.querySelectorAll("tr")[row]?.scrollIntoView({ block: "center" });
    return true;
  }
  return false;
}

// The cell being edited in this view, where its cursor stands in it and where the table starts in
// the note, for whoever rewrites the note to open it again after: Obsidian draws a table anew when
// its text changes, and the cell's own editor goes with the old drawing.
export function editingCell(view: MarkdownView): { row: number; col: number; ch: number; start: number } | null {
  const native = nativeCell(view);
  const row = native?.cell?.row;
  const col = native?.cell?.col;
  const start = native?.table?.start;
  const editor = native?.editor as { cm?: EditorView } | undefined;
  if (typeof row !== "number" || typeof col !== "number" || typeof start !== "number" || !editor?.cm) return null;
  return { row, col, start, ch: editor.cm.state.selection.main.head };
}
