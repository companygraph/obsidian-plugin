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
import { cellOfFailure } from "./tables.ts";
import { openCell } from "./livetable.ts";

function focusRow(view: unknown, line: number): boolean {
  if (!(view instanceof MarkdownView)) return true;
  const field = fieldOfLine(view.editor.getValue().split("\n"), line);
  return field ? focusProperty(view, field) : true;
}

// `message` is a failure's words, which name the column a cell failure is in; a mention has none
// and lands in the row's first cell.
function place(view: unknown, line: number, message: string) {
  if (!(view instanceof MarkdownView) || view.getMode() !== "source") return;
  const editor = view.editor;
  if (line < 0 || line >= editor.lineCount()) return;
  const at = { line, ch: 0 };
  // Twice, a breath apart: the section under a note is hung in the same scroller a moment after
  // the note opens, and whatever is added there moves what was already scrolled to. The second
  // pass puts the line back in the middle once the note has settled.
  const show = () => editor.scrollIntoView({ from: at, to: at }, true);
  show();
  window.setTimeout(show, 300);
  const cm = (editor as unknown as { cm?: EditorView }).cm;
  const live = cm?.state.field(editorLivePreviewField, false) === true;
  const cell = live ? cellOfFailure(editor.getValue().split("\n"), line, message) : null;
  if (!cell || !cm) {
    editor.setCursor(at);
    return;
  }
  // The table is drawn once it is in view, so it is asked for a moment after the scroll.
  const open = () => openCell(view, cm, cell.first, cell.row, cell.col);
  window.setTimeout(() => { if (!open()) window.setTimeout(open, 200); }, 50);
}

export async function openAt(app: App, path: string, line: number, message = "") {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, { active: true, eState: { line } });
  // In Live Preview a frontmatter line sits behind the Properties widget and the cursor has
  // nowhere visible to land; bringing the note to the front keeps the click from feeling dead.
  app.workspace.setActiveLeaf(leaf, { focus: true });
  const view = leaf.view;
  const inFrontmatter = view instanceof MarkdownView && fieldOfLine(view.editor.getValue().split("\n"), line) !== null;
  // A note only just opened may not have drawn the widget's rows yet, so the row is asked twice.
  if (inFrontmatter) {
    if (!focusRow(view, line)) window.setTimeout(() => focusRow(view, line), 150);
  } else place(view, line, message);
}
