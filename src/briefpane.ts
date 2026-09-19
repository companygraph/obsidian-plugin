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

    const md: string[] = [];
    const status = brief.required === null ? "not in the schema" : brief.required ? "required" : "optional";
    md.push(`**${type}** · ${brief.place ? `\`${brief.place}\`` : "here"} · ${status}`, "");
    if (brief.description) md.push(brief.description, "");
    const named = brief.rules.filter((r) => r.names);
    if (named.length) md.push("#### Writing rules for this", "", ...named.map((r) => `- ${r.text}`), "");
    const rest = brief.rules.filter((r) => !r.names);
    if (rest.length) md.push(named.length ? "#### The type's other writing rules" : "#### The type's writing rules", "", ...rest.map((r) => `- ${r.text}`), "");
    if (brief.purpose) md.push(`#### What a ${type} is for`, "", brief.purpose, "");
    md.push("*Writing rules are a judgment: no check reads them, and the agent pass holds a page to them.*");
    const text = md.join("\n");
    if (this.shown === text) return;
    this.shown = text;
    this.clear();
    this.rendered = this.addChild(new Component());
    void MarkdownRenderer.render(this.app, text, this.contentEl.createDiv(), path ?? "", this.rendered);
  }
}
