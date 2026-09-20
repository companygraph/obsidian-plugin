// The instance's compliance with the meta-model, beside the editor: what the checks came to, then
// the failures grouped by file. A type whose schema the vendored core does not carry is said
// under them, since nothing held it.
import { ItemView, MarkdownView, Notice, TFile, editorLivePreviewField, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import { IDLE_TEXT, groupsOf, headline, noSchemaFor, reportText } from "./report.ts";
import { fieldOfLine } from "./properties.ts";
import { focusProperty } from "./widget.ts";
import { cellOfFailure } from "./tables.ts";
import { openCell } from "./livetable.ts";
import type { EditorView } from "@codemirror/view";
import { draggedOver } from "./dragged.ts";

export const VIEW_TYPE = "companygraph-checks";

export class Pane extends ItemView {
  plugin: CompanyGraphPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: CompanyGraphPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Meta-model compliance"; }
  getIcon() { return "list-checks"; }

  async onOpen() { this.render(); }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("companygraph-pane");
    const state = this.plugin.state;

    // What the checks came to, first and in one line: passed, failed with a count, checking, or
    // not checked at all. Told apart by the icon as well as the colour.
    const kind =
      state.status === "checked" ? (state.located.length ? "fail" : "pass") : state.status;
    const banner = el.createDiv({ cls: `companygraph-banner is-${kind}` });
    const icon = banner.createSpan({ cls: "companygraph-banner-icon" });
    setIcon(icon, { pass: "check-circle-2", fail: "x-circle", checking: "loader", idle: "info", refused: "alert-triangle" }[kind] ?? "info");
    const words = banner.createDiv({ cls: "companygraph-banner-words" });
    const title = headline(state);
    words.createDiv({ cls: "companygraph-banner-title", text: title.charAt(0).toUpperCase() + title.slice(1) });
    words.createDiv({ cls: "companygraph-banner-sub", text: `meta-model ${this.plugin.checker}` });
    // Obsidian switches text selection off for the whole application and back on in its editor;
    // a pane has to ask for it (styles.css does), and a report is something one pastes to an
    // agent or into an issue, so the whole of it can also be copied at once, as text.
    const copy = banner.createEl("button", { cls: "companygraph-copy clickable-icon" });
    setIcon(copy, "copy");
    copy.setAttribute("aria-label", "Copy report");
    copy.onClickEvent(() => {
      void navigator.clipboard.writeText(reportText(state)).then(() => new Notice("CompanyGraph: report copied"));
    });

    if (state.status === "checking") return;
    if (state.status === "idle") {
      el.createDiv({ cls: "companygraph-pane-note", text: IDLE_TEXT });
      return;
    }
    if (state.notice) el.createDiv({ cls: "companygraph-pane-note companygraph-notice", text: state.notice });
    if (state.status === "refused") return;

    for (const group of groupsOf(state.located)) {
      const file = el.createDiv({ cls: "companygraph-file" });
      const head = file.createDiv({ cls: "companygraph-file-head" });
      setIcon(head.createSpan({ cls: "companygraph-file-icon" }), group.path ? "file-text" : "boxes");
      const slash = group.path ? group.path.lastIndexOf("/") : -1;
      const name = head.createDiv({ cls: "companygraph-file-name" });
      name.createSpan({ text: group.path ? group.path.slice(slash + 1).replace(/\.md$/, "") : group.title });
      if (group.path && slash > 0) name.createSpan({ cls: "companygraph-file-folder", text: group.path.slice(0, slash) });
      head.createSpan({ cls: "companygraph-count", text: String(group.entries.length) });
      const list = file.createEl("ul");
      for (const found of group.entries) {
        const item = list.createEl("li");
        if (found.path) item.createSpan({ cls: "companygraph-line", text: `${found.line + 1}` });
        item.createSpan({ cls: "companygraph-message", text: found.message });
        // Only an entry with a file opens anything, and only that one reads as something to press.
        if (found.path) {
          item.addClass("companygraph-open");
          item.onClickEvent(() => {
            // A press that ends a drag over this entry's own text was a selection, not a wish to leave.
            if (draggedOver(item, activeWindow.getSelection())) return;
            void this.openAt(found.path!, found.line, found.message);
          });
        }
      }
    }

    const missing = noSchemaFor(state.skipped);
    if (missing) el.createDiv({ cls: "companygraph-pane-note", text: missing });
  }

  // Not `open`: Obsidian's View has an internal method of that name, which the leaf calls to set
  // a view up and which is what calls `onOpen`. The public types do not declare it, so a method
  // named `open` here typechecks, replaces it, and leaves the pane blank.
  async openAt(path: string, line: number, message = "") {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true, eState: { line } });
    // In Live Preview a frontmatter line sits behind the Properties widget and the cursor has
    // nowhere visible to land; bringing the note to the front keeps the click from feeling dead.
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    // Where the widget is drawn, the failing field's row takes the focus, so the correction can
    // be typed at once. Found through the same markup the tint uses; a note only just opened
    // may not have drawn its rows yet, so it is tried once more a moment later.
    const view = leaf.view;
    const inFrontmatter = view instanceof MarkdownView && fieldOfLine(view.editor.getValue().split("\n"), line) !== null;
    if (inFrontmatter) {
      if (!this.focusRow(view, line)) window.setTimeout(() => this.focusRow(view, line), 150);
    } else this.place(view, line, message);
  }

  // Where a failure in the body lands, in the editor; Reading view scrolls to the line and
  // highlights it from the line handed to openFile. A line is scrolled to the middle of the view
  // and the cursor put on it, except in a table drawn by Live Preview, where a cursor has no row
  // to stand on: there the failing cell is opened, as a click on it would open it.
  place(view: unknown, line: number, message: string) {
    if (!(view instanceof MarkdownView) || view.getMode() !== "source") return;
    const editor = view.editor;
    if (line < 0 || line >= editor.lineCount()) return;
    const at = { line, ch: 0 };
    editor.scrollIntoView({ from: at, to: at }, true);
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

  focusRow(view: unknown, line: number): boolean {
    if (!(view instanceof MarkdownView)) return true;
    const field = fieldOfLine(view.editor.getValue().split("\n"), line);
    return field ? focusProperty(view, field) : true;
  }
}
