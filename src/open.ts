// Opening a note at a line, for every list that names one: the compliance pane's failures and the
// references pane's mentions alike. A cursor is placed where the line is, which Obsidian's own
// handling of an opened file does not do the same way in every view: Reading view scrolls to the
// line and highlights it, the editor is scrolled and given a cursor, a line inside a table drawn
// by Live Preview has no row for a cursor to stand on and the cell is opened instead, and a
// frontmatter line sits behind the Properties widget, whose row takes the focus.
import { MarkdownView, TFile, editorLivePreviewField } from "obsidian";
import type { App } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { fieldOfLine } from "./properties.ts";
import { focusProperty } from "./widget.ts";
import { cellOfFailure, cellOfLine } from "./tables.ts";
import type { Cell } from "./tables.ts";
import { openCell } from "./livetable.ts";
import { until } from "./until.ts";

function focusRow(view: MarkdownView, line: number): boolean {
  const field = fieldOfLine(view.editor.getValue().split("\n"), line);
  return field ? focusProperty(view, field) : true;
}

// How long a cell is waited for: asked every tenth of a second, for eight seconds in all. The
// widget of the longest table in the owner's profile was measured being drawn anywhere between a
// quarter of a second and two and a half after the note opened.
const EVERY = 100;
const TRIES = 80;

// A cell of a table drawn by Live Preview is opened once the note has settled and its widget is
// there, however long that takes: CodeMirror draws a table only when it is in sight, so the line
// is scrolled to before every try, and never after the cell is open, since a scroll closes it.
function openWhenDrawn(view: MarkdownView, cm: EditorView, line: number, cell: Cell) {
  const file = view.file;
  const at = { line, ch: 0 };
  const show = () => view.editor.scrollIntoView({ from: at, to: at }, true);
  show();
  window.setTimeout(() => until(() => {
    // Another note came into the leaf while this one was waited for: the reader has moved on.
    if (view.file !== file) return true;
    show();
    return openCell(view, cm, cell.first, cell.row, cell.col);
  }, { every: EVERY, tries: TRIES, later: (run, ms) => window.setTimeout(run, ms) }), 300);
}

function placeCursor(view: MarkdownView, line: number) {
  const editor = view.editor;
  if (view.getMode() !== "source" || line < 0 || line >= editor.lineCount()) return;
  const at = { line, ch: 0 };
  const show = () => editor.scrollIntoView({ from: at, to: at }, true);
  show();
  editor.setCursor(at);
  // Again a breath later: the section under a note is hung in the same scroller a moment after
  // the note opens, and whatever is added there moves what was already scrolled to.
  window.setTimeout(show, 300);
}

// `message` is a failure's words, which name the column a cell failure is in; `column` is the
// column a mention stands in, which its list knows from what declares it. With neither, the
// row's first cell.
export async function openAt(app: App, path: string, line: number, message = "", column: string | null = null) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  // The note belongs in the main area, never in the sidebar the click came from: a leaf asked for
  // while a sidebar pane is active can be that pane's own, and the list would open the note over
  // itself. The most recent leaf of the main area is where a reader expects it.
  const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(false);
  // The line is not handed over with the file. Obsidian would put the note's own cursor on it,
  // and on a line of a table drawn by Live Preview that cursor is a trap: at the next thing any
  // plugin tells the editor, Obsidian moves it into the table's last row, over whichever cell was
  // opened here, and writes the table out again in its own padding on the way. Read from the
  // installed application (`receiveSelection`) and watched doing it.
  await leaf.openFile(file, { active: true });
  // In Live Preview a frontmatter line sits behind the Properties widget and the cursor has
  // nowhere visible to land; bringing the note to the front keeps the click from feeling dead.
  app.workspace.setActiveLeaf(leaf, { focus: true });
  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return;
  const lines = view.editor.getValue().split("\n");
  const cm = (view.editor as unknown as { cm?: EditorView }).cm;
  const live = view.getMode() === "source" && cm?.state.field(editorLivePreviewField, false) === true;
  const cell = !live ? null : column === null ? cellOfFailure(lines, line, message) : cellOfLine(lines, line, column);
  if (cell && cm) return openWhenDrawn(view, cm, line, cell);
  // Everywhere else the line is Obsidian's to place, each view its own way.
  view.setEphemeralState({ line });
  // A note only just opened may not have drawn the widget's rows yet, so the row is asked twice.
  if (fieldOfLine(lines, line) !== null) {
    if (!focusRow(view, line)) window.setTimeout(() => focusRow(view, line), 150);
  } else placeCursor(view, line);
}
