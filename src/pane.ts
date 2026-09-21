// The instance's compliance with the meta-model, beside the editor: what the checks came to, then
// the failures grouped by file. A type whose schema the vendored core does not carry is said
// under them, since nothing held it.
import { ItemView, Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { IMAGE_FILE } from "companygraph-meta-model/instance";
import type CompanyGraphPlugin from "./main.ts";
import { IDLE_TEXT, groupsOf, headline, noSchemaFor, reportText } from "./report.ts";
import { openAt } from "./open.ts";
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
        // A picture has no line to point to (R9).
        if (found.path && !IMAGE_FILE.test(found.path)) item.createSpan({ cls: "companygraph-line", text: `${found.line + 1}` });
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

  // The one opener every list of places uses; not named `open`, since Obsidian's View has an
  // internal method of that name which the leaf calls to set a view up, and a method named `open`
  // here typechecks, replaces it, and leaves the pane blank.
  async openAt(path: string, line: number, message = "") {
    await openAt(this.app, path, line, message);
  }
}
