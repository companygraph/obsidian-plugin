// The report beside the editor: failures grouped by file, then what was not checked. It ends
// that way on every render, because a green list alone reads as a validated instance.
import { ItemView, MarkdownView, Notice, TFile, editorLivePreviewField, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import { IDLE_TEXT, groupsOf, headline, notChecked, reportText } from "./report.ts";
import { judgedGroups } from "./judgedview.ts";
import { fieldOfLine } from "./properties.ts";
import { focusProperty } from "./widget.ts";
import { cellOfFailure } from "./tables.ts";
import { openCell } from "./livetable.ts";
import type { EditorView } from "@codemirror/view";

export const VIEW_TYPE = "companygraph-checks";

export class Pane extends ItemView {
  plugin: CompanyGraphPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: CompanyGraphPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "CompanyGraph checks"; }
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

    const judging = this.plugin.judging;
    if (judging.running) {
      const run = el.createDiv({ cls: "companygraph-run" });
      const secs = Math.round((Date.now() - judging.running.started) / 1000);
      const what = judging.running.scope.kind === "note" ? judging.running.scope.path : "the instance";
      run.createSpan({ text: `Claude Code is judging ${what} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` });
      run.createEl("button", { text: "Cancel" }).onClickEvent(() => judging.cancel());
    } else if (judging.failure) {
      el.createDiv({ cls: "companygraph-pane-note companygraph-notice", text: judging.failure });
    }

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
            // A press that ends a drag over the text was a selection, not a wish to leave.
            if (activeWindow.getSelection()?.toString()) return;
            void this.openAt(found.path!, found.line, found.message);
          });
        }
      }
    }

    // Every report ends with what it did not check, because a green list alone reads as a
    // validated instance; folded, so it is there without standing in front of the failures.
    const lines = notChecked(state.skipped);
    const not = el.createEl("details", { cls: "companygraph-not-checked" });
    not.createEl("summary", { text: `Not checked · ${lines.length}` });
    const ul = not.createEl("ul");
    for (const line of lines) ul.createEl("li", { text: line });

    // The agent pass's own findings, kept apart from the mechanical checks above: writing rules
    // are read, not run, so their verdicts are Claude Code's, not the plugin's own.
    const store = this.plugin.judged;
    const groups = judgedGroups(store, (p) => this.plugin.files.get(p) ?? null);
    if (store.last || groups.length) {
      const section = el.createDiv({ cls: "companygraph-judged-section" });
      section.createDiv({ cls: "companygraph-judged-title", text: "Writing rules, judged by Claude Code" });
      if (!groups.length) section.createDiv({ cls: "companygraph-pane-note", text: "No breach was judged." });
      for (const group of groups) {
        const file = section.createDiv({ cls: `companygraph-file${group.stale ? " is-stale" : ""}` });
        const head = file.createDiv({ cls: "companygraph-file-head" });
        head.createDiv({ cls: "companygraph-file-name", text: group.path ?? "The instance" });
        if (group.stale) head.createSpan({ cls: "companygraph-stale", text: "judged an earlier version" });
        const list = file.createEl("ul");
        for (const j of group.judgments) {
          const item = list.createEl("li");
          if (group.path) item.createSpan({ cls: "companygraph-line", text: j.placed === "line" ? `${j.line + 1}` : "·" });
          const words = item.createDiv({ cls: "companygraph-message" });
          words.createDiv({ cls: "companygraph-judged-rule", text: j.rule });
          words.createDiv({ text: group.path ? j.judgment : `${j.path}: ${j.judgment}` });
          if (group.path) {
            item.addClass("companygraph-open");
            item.onClickEvent(() => {
              if (activeWindow.getSelection()?.toString()) return;
              void this.openAt(group.path!, j.line);
            });
          }
        }
      }
      if (store.gaps.length) {
        const gaps = section.createEl("details", { cls: "companygraph-not-checked" });
        gaps.createEl("summary", { text: `Gaps · ${store.gaps.length}` });
        const gapList = gaps.createEl("ul");
        for (const g of store.gaps) gapList.createEl("li", { text: `${g.profile}: ${g.role} requires ${g.skill}` });
      }
      if (store.notJudged.length) {
        const notRun = section.createEl("details", { cls: "companygraph-not-checked" });
        notRun.createEl("summary", { text: `Not judged · ${store.notJudged.length}` });
        const notRunList = notRun.createEl("ul");
        for (const line of store.notJudged) notRunList.createEl("li", { text: line });
      }
      const last = store.last;
      if (last) {
        const when = new Date(last.at).toLocaleString();
        const cost = last.cost === null ? "" : ` · $${last.cost.toFixed(2)}`;
        const program = last.program ? ` · ${last.program.slice(last.program.lastIndexOf("/") + 1)}` : "";
        const denied = last.denied.length ? ` · refused: ${last.denied.join(", ")}` : "";
        section.createDiv({ cls: "companygraph-banner-sub", text: `Last run: ${last.scope === "note" ? last.path : "the instance"}, ${when}, ${last.seconds} s${cost}${program}${denied}` });
      }
    }
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
