// The report beside the editor: failures grouped by file, then what was not checked. It ends
// that way on every render, because a green list alone reads as a validated instance.
import { ItemView, MarkdownView, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import type { Located } from "./locate.ts";
import { fieldOfLine } from "./properties.ts";
import { focusProperty } from "./widget.ts";

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

    if (state.status === "checking") {
      el.createEl("p", { text: "Checking the instance…" });
      return;
    }
    if (state.status === "idle") {
      el.createEl("p", {
        text: "This vault has no .companygraph/manifest.json, so it is not an instance and nothing is checked."
          + ' Run "CompanyGraph: Check the instance now" after adding one.',
      });
      return;
    }
    if (state.notice) el.createEl("p", { text: state.notice, cls: "companygraph-notice" });
    if (state.status === "refused") return;

    const count = state.located.length;
    el.createEl("h4", { text: count === 0 ? "The mechanical checks pass" : `${count} failure${count > 1 ? "s" : ""}` });
    const byPath = new Map<string | null, Located[]>();
    for (const found of state.located) byPath.set(found.path, [...(byPath.get(found.path) ?? []), found]);
    for (const [path, group] of byPath) {
      el.createEl("h5", { text: path ?? "The instance" });
      const list = el.createEl("ul");
      for (const found of group) {
        const item = list.createEl("li", { text: found.message });
        // Only an entry with a file opens anything, and only that one reads as something to press.
        if (found.path) {
          item.addClass("companygraph-open");
          item.onClickEvent(() => void this.openAt(found.path!, found.line));
        }
      }
    }

    el.createEl("h4", { text: "Not checked" });
    const not = el.createEl("ul");
    for (const type of state.skipped) not.createEl("li", { text: `${type}: the vendored core carries no schema for it` });
    not.createEl("li", { text: "every ## Writing rules in every schema: that is the agent pass, R0" });
  }

  // Not `open`: Obsidian's View has an internal method of that name, which the leaf calls to set
  // a view up and which is what calls `onOpen`. The public types do not declare it, so a method
  // named `open` here typechecks, replaces it, and leaves the pane blank.
  async openAt(path: string, line: number) {
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
    if (!this.focusRow(leaf.view, line)) window.setTimeout(() => this.focusRow(leaf.view, line), 150);
  }

  focusRow(view: unknown, line: number): boolean {
    if (!(view instanceof MarkdownView)) return true;
    const field = fieldOfLine(view.editor.getValue().split("\n"), line);
    return field ? focusProperty(view, field) : true;
  }
}
