// The writing brief beside the editor (spec §8). What it says is brief.ts's; here it follows the
// cursor, in the note that has the focus. A place and a mention read by name rather than in the
// schema's syntax: `## Why` is the section Why, a chip that moves the cursor there when the note
// has it. What names the place stays open; the type's other rules fold under the place each names
// first, and which groups are open is remembered by type. A note that is no entity, or a vault
// that is no instance, gets a line saying so and nothing else.
import { ItemView, MarkdownView, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { briefOf, lineOf, placeAt } from "./brief.ts";
import type { Part, Rule, Target } from "./brief.ts";

export const BRIEF_VIEW = "companygraph-brief";

export class BriefPane extends ItemView {
  plugin: CompanyGraphPlugin;
  // What is shown now, so a cursor that moves within one place does not draw it again.
  shown = "";

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

  say(text: string) {
    if (this.shown === text) return;
    this.shown = text;
    this.contentEl.empty();
    this.contentEl.createEl("p", { text, cls: "companygraph-brief-idle" });
  }

  // The brief for a line of the note at `path`, whose text is `lines`.
  show(path: string | null, lines: string[], line: number) {
    const layout = this.plugin.layout;
    if (!layout) return this.say("This vault is not a CompanyGraph instance.");
    const type = path && path.startsWith(`${layout.model}/`) ? typeOfPath(path, layout.model) : null;
    const schema = type ? this.plugin.schemas.get(`${type}-schema.md`) : undefined;
    if (!path || !type || !schema) return this.say("Put the cursor in an entity's note.");
    const place = placeAt(lines, line);
    if (!place) return this.say(`A ${type}: the cursor is on the frontmatter's fence.`);
    const brief = briefOf(schema, place);
    // Where each place a rule names sits in the note, since a chip moves the cursor only to a
    // place the note has.
    const at = new Map<string, number | null>();
    const lineFor = (target: Target) => {
      const key = JSON.stringify(target);
      if (!at.has(key)) at.set(key, lineOf(lines, target));
      return at.get(key)!;
    };
    for (const rule of brief.rules) for (const part of rule.parts) if (part.kind === "section" || part.kind === "field") lineFor({ kind: part.kind, name: part.text });
    const key = JSON.stringify([path, type, brief, [...at]]);
    if (this.shown === key) return;
    this.shown = key;
    this.contentEl.empty();

    const status = brief.required === null ? "own" : brief.required ? "required" : "optional";
    const card = this.contentEl.createDiv({ cls: "companygraph-brief-card" });
    const head = card.createDiv({ cls: "companygraph-brief-head" });
    head.createSpan({ cls: "companygraph-brief-type", text: type });
    head.createSpan({
      cls: `companygraph-brief-badge is-${status}`,
      text: status === "own" ? "not in the schema" : status,
    });
    const where = card.createDiv({ cls: "companygraph-brief-where" });
    where.createSpan({ cls: "companygraph-brief-kind", text: brief.label });
    where.createSpan({ cls: `companygraph-brief-place${brief.label === "Field" ? " is-field" : ""}`, text: brief.name });
    if (brief.description) card.createDiv({ cls: "companygraph-brief-lead", text: brief.description });
    else if (status === "own") card.createDiv({ cls: "companygraph-brief-lead is-muted", text: "A section of the page's own: the schema says nothing of it, and the type's rules still hold." });
    if (brief.type || brief.columns.length) {
      const meta = card.createDiv({ cls: "companygraph-brief-meta" });
      if (brief.type) meta.createSpan({ text: brief.type });
      for (const column of brief.columns) meta.createSpan({ text: column });
    }

    const rule = (into: HTMLElement, r: Rule) => this.rule(into.createEl("li"), r.parts, path, lineFor);
    const named = brief.rules.filter((r) => r.names);
    const own = this.contentEl.createDiv({ cls: "companygraph-brief-rules is-named" });
    own.createDiv({ cls: "companygraph-brief-label", text: named.length === 1 ? "The rule for this" : "The rules for this" });
    if (named.length) {
      const ul = own.createEl("ul");
      for (const r of named) rule(ul, r);
    } else own.createDiv({ cls: "companygraph-brief-none", text: "No rule names this place; the type's rules below still hold." });

    if (brief.groups.length) {
      const opened = new Set(this.plugin.settings.briefOpen[type] ?? []);
      const block = this.contentEl.createDiv({ cls: "companygraph-brief-rules is-rest" });
      const label = block.createDiv({ cls: "companygraph-brief-label", text: named.length ? "The type's other rules" : "The type's writing rules" });
      const toggle = label.createEl("button", { cls: "companygraph-brief-toggle" });
      const list = block.createDiv({ cls: "companygraph-brief-groups" });
      const all: HTMLDetailsElement[] = [];
      const labelToggle = () => { toggle.setText(all.every((d) => d.open) ? "Collapse all" : "Expand all"); };
      const remember = () => {
        const open = new Set(opened);
        for (const d of all) d.open ? open.add(d.dataset.group!) : open.delete(d.dataset.group!);
        this.plugin.settings.briefOpen[type] = [...open];
        void this.plugin.saveSettings();
        labelToggle();
      };
      for (const group of brief.groups) {
        const details = list.createEl("details", { cls: "companygraph-brief-group" });
        details.dataset.group = group.key;
        details.open = opened.has(group.key);
        const summary = details.createEl("summary");
        setIcon(summary.createSpan({ cls: "companygraph-brief-chevron" }), "chevron-right");
        summary.createSpan({ cls: "companygraph-brief-kind", text: group.label });
        summary.createSpan({ cls: "companygraph-brief-group-name", text: group.name });
        summary.createSpan({ cls: "companygraph-brief-count", text: String(group.rules.length) });
        const ul = details.createEl("ul");
        for (const r of group.rules) rule(ul, r);
        details.addEventListener("toggle", remember);
        all.push(details);
      }
      labelToggle();
      toggle.addEventListener("click", () => {
        const open = !all.every((d) => d.open);
        for (const d of all) d.open = open;
      });
    }

    if (brief.purpose) {
      const details = this.contentEl.createEl("details", { cls: "companygraph-brief-purpose" });
      const summary = details.createEl("summary");
      summary.createDiv({ cls: "companygraph-brief-label", text: `What a ${type} is for` });
      const lead = summary.createDiv({ cls: "companygraph-brief-tease", text: `${brief.purpose.lead} ` });
      if (brief.purpose.rest) {
        lead.createSpan({ cls: "companygraph-brief-more", text: "More" });
        details.createDiv({ cls: "companygraph-brief-rest", text: brief.purpose.rest });
      }
    }
    this.contentEl.createDiv({
      cls: "companygraph-brief-foot",
      text: "Writing rules are a judgment: no check reads them, and the agent pass holds a page to them.",
    });
  }

  // A rule by its parts: a section or a field a chip, a button where the note has that place.
  rule(into: HTMLElement, parts: Part[], path: string, lineFor: (target: Target) => number | null) {
    for (const part of parts) {
      if (part.kind === "text") into.appendText(part.text);
      else if (part.kind === "example") into.createSpan({ cls: "companygraph-brief-example", text: part.text });
      else if (part.kind === "code") into.createEl("code", { text: part.text });
      else {
        const line = lineFor({ kind: part.kind, name: part.text });
        const cls = `companygraph-brief-mention is-${part.kind}`;
        if (line === null) {
          into.createSpan({ cls, text: part.text, attr: { title: `This note has no ${part.kind === "section" ? "section" : "field"} ${part.text}.` } });
          continue;
        }
        const chip = into.createEl("button", { cls, text: part.text, attr: { title: `Go to ${part.text}` } });
        chip.addEventListener("click", () => this.goTo(path, line));
      }
    }
  }

  // The cursor to the start of a line of the note at `path`, in the editor that holds it.
  goTo(path: string, line: number) {
    const leaf = this.app.workspace.getLeavesOfType("markdown").find((l) => l.view instanceof MarkdownView && l.view.file?.path === path);
    if (!(leaf?.view instanceof MarkdownView)) return;
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    const editor = leaf.view.editor;
    editor.setCursor({ line, ch: 0 });
    editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    editor.focus();
  }
}
