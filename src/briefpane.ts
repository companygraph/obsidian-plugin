// The writing brief beside the editor (spec §8). What it says is brief.ts's; here it follows the
// cursor, in the note that has the focus, and renders the schema's own words as Markdown, so a
// name in backticks reads as it does in the schema. A note that is no entity, or a vault that is
// no instance, gets a line saying so and nothing else.
import { Component, ItemView, MarkdownRenderer } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { briefOf, placeAt } from "./brief.ts";

export const BRIEF_VIEW = "companygraph-brief";

export class BriefPane extends ItemView {
  plugin: CompanyGraphPlugin;
  // What is shown now, so a cursor that moves within one place does not draw it again.
  shown = "";
  // The component the current render hangs on, unloaded when the next one replaces it, so what
  // a post-processor adds to a render does not pile up for as long as the pane is open.
  rendered: Component | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CompanyGraphPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return BRIEF_VIEW; }
  getDisplayText() { return "CompanyGraph brief"; }
  getIcon() { return "notebook-pen"; }

  async onOpen() {
    this.contentEl.addClass("companygraph-brief");
    this.say("Put the cursor in an entity's note.");
    this.plugin.refreshBrief();
  }

  clear() {
    if (this.rendered) this.removeChild(this.rendered);
    this.rendered = null;
    this.contentEl.empty();
  }

  say(text: string) {
    if (this.shown === text) return;
    this.shown = text;
    this.clear();
    this.contentEl.createEl("p", { text, cls: "companygraph-brief-idle" });
  }

  // The brief for a line of the note at `path`, whose text is `lines`.
  show(path: string | null, lines: string[], line: number) {
    const layout = this.plugin.layout;
    if (!layout) return this.say("This vault is not a CompanyGraph instance.");
    const type = path && path.startsWith(`${layout.model}/`) ? typeOfPath(path, layout.model) : null;
    const schema = type ? this.plugin.schemas.get(`${type}-schema.md`) : undefined;
    if (!type || !schema) return this.say("Put the cursor in an entity's note.");
    const place = placeAt(lines, line);
    if (!place) return this.say(`A ${type}: the cursor is on the frontmatter's fence.`);
    const brief = briefOf(schema, place);
    const status = brief.required === null ? "own" : brief.required ? "required" : "optional";
    const key = JSON.stringify([path, type, brief]);
    if (this.shown === key) return;
    this.shown = key;
    this.clear();
    const component = (this.rendered = this.addChild(new Component()));
    // The schema's words are Markdown: a name in backticks reads as it does in the schema.
    const markdown = (text: string, into: HTMLElement) =>
      void MarkdownRenderer.render(this.app, text, into, path ?? "", component);

    const card = this.contentEl.createDiv({ cls: "companygraph-brief-card" });
    const head = card.createDiv({ cls: "companygraph-brief-head" });
    head.createSpan({ cls: "companygraph-brief-type", text: type });
    if (brief.place) head.createEl("code", { cls: "companygraph-brief-place", text: brief.place });
    head.createSpan({
      cls: `companygraph-brief-badge is-${status}`,
      text: status === "own" ? "not in the schema" : status,
    });
    if (brief.description) markdown(brief.description, card.createDiv({ cls: "companygraph-brief-lead" }));
    else if (status === "own") card.createDiv({ cls: "companygraph-brief-lead is-muted", text: "A section of the page's own: the schema says nothing of it, and the type's rules still hold." });

    const named = brief.rules.filter((r) => r.names);
    const rest = brief.rules.filter((r) => !r.names);
    const rules = (title: string, list: typeof brief.rules, cls: string) => {
      if (!list.length) return;
      const block = this.contentEl.createDiv({ cls: `companygraph-brief-rules ${cls}` });
      block.createDiv({ cls: "companygraph-brief-label", text: title });
      const ul = block.createEl("ul");
      for (const rule of list) markdown(rule.text, ul.createEl("li"));
    };
    rules(named.length === 1 ? "The rule for this" : "The rules for this", named, "is-named");
    rules(named.length ? "The type's other writing rules" : "The type's writing rules", rest, "is-rest");

    if (brief.purpose) {
      const details = this.contentEl.createEl("details", { cls: "companygraph-brief-purpose" });
      details.createEl("summary", { text: `What a ${type} is for` });
      markdown(brief.purpose, details.createDiv());
    }
    this.contentEl.createDiv({
      cls: "companygraph-brief-foot",
      text: "Writing rules are a judgment: no check reads them, and the agent pass holds a page to them.",
    });
  }
}
