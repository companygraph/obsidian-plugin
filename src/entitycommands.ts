// Rename entity and Delete entity (spec §8). What either changes is refactor.ts's, worked out
// from the vault as it is when the change is confirmed, after every open note is saved, so that
// nothing typed a moment ago is written over. Both show the plan first and write nothing until it
// is confirmed. The files are changed through the vault, so an open note is reloaded as Obsidian
// reloads any file changed under it, which the heading lock lets through.
import { MarkdownView, Modal, Notice, Setting, TFile } from "obsidian";
import type { App } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import { readInstance } from "./vault.ts";
import { deletePlan, renamePlan } from "./refactor.ts";
import type { Mention } from "./refactor.ts";
import type { Named } from "./scope.ts";

async function saveOpenNotes(app: App) {
  const saves: Promise<void>[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof MarkdownView) saves.push(leaf.view.save());
  });
  await Promise.all(saves);
}

// Mentions counted per file, for a plan's list.
function perFile(mentions: Mention[]): string[] {
  const counts = new Map<string, number>();
  for (const m of mentions) counts.set(m.path, (counts.get(m.path) ?? 0) + 1);
  return [...counts].map(([path, n]) => (n === 1 ? path : `${path} (${n})`));
}

function list(el: HTMLElement, title: string, items: string[]) {
  if (!items.length) return;
  el.createEl("p", { text: title });
  const ul = el.createEl("ul", { cls: "companygraph-plan" });
  for (const item of items) ul.createEl("li", { text: item });
}

export class RenameEntity extends Modal {
  plugin: CompanyGraphPlugin;
  target: Named;
  name: string;
  busy = false;

  constructor(plugin: CompanyGraphPlugin, target: Named) {
    super(plugin.app);
    this.plugin = plugin;
    this.target = target;
    this.name = target.name;
  }

  onOpen() {
    this.titleEl.setText(`Rename ${this.target.type} "${this.target.name}"`);
    const plan = this.contentEl.createDiv();
    new Setting(this.contentEl.createDiv())
      .setName("New name")
      .setDesc("The H1, the file where its name derives, and every reference that resolves to it")
      .addText((text) => {
        text.setValue(this.name).onChange((v) => {
          this.name = v;
          plan.empty();
        });
        text.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing && !e.repeat) void this.review(plan); });
        window.setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 0);
      });
    this.contentEl.appendChild(plan);
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Review").onClick(() => void this.review(plan)))
      .addButton((b) => b.setButtonText("Rename").setCta().onClick(() => void this.rename()));
  }

  async review(el: HTMLElement) {
    el.empty();
    const layout = this.plugin.layout;
    if (!layout) return;
    await saveOpenNotes(this.app);
    const files = await readInstance(this.app, layout);
    const plan = renamePlan(files, this.plugin.vocabulary, this.plugin.named, layout.model, this.target, this.name);
    if ("refused" in plan) {
      el.createEl("p", { text: plan.refused, cls: "companygraph-notice" });
      return;
    }
    list(el, "Moves:", plan.moves.map((m) => `${m.from} → ${m.to}`));
    list(el, `References to rewrite, ${plan.mentions.length}:`, perFile(plan.mentions));
    if (!plan.mentions.length) el.createEl("p", { text: "No reference names it." });
  }

  async rename() {
    const layout = this.plugin.layout;
    if (this.busy || !layout) return;
    this.busy = true;
    try {
      await saveOpenNotes(this.app);
      const files = await readInstance(this.app, layout);
      const plan = renamePlan(files, this.plugin.vocabulary, this.plugin.named, layout.model, this.target, this.name);
      if ("refused" in plan) {
        new Notice(plan.refused);
        return;
      }
      const vault = this.app.vault;
      for (const [path, text] of plan.texts) {
        const file = vault.getAbstractFileByPath(path);
        if (file instanceof TFile && text !== files.get(path)) await vault.modify(file, text);
      }
      for (const move of plan.moves) {
        const from = vault.getAbstractFileByPath(move.from);
        if (from) await this.app.fileManager.renameFile(from, move.to);
      }
      this.close();
      const count = plan.mentions.length;
      new Notice(`Renamed to "${plan.name}"${count ? `, and ${count} reference${count === 1 ? "" : "s"} with it` : ""}.`);
    } catch (error) {
      new Notice(`The rename stopped part way: ${error instanceof Error ? error.message : String(error)}. The pane shows what is left.`);
    } finally {
      this.busy = false;
    }
  }

  onClose() { this.contentEl.empty(); }
}

export class DeleteEntity extends Modal {
  plugin: CompanyGraphPlugin;
  target: Named;
  busy = false;

  constructor(plugin: CompanyGraphPlugin, target: Named) {
    super(plugin.app);
    this.plugin = plugin;
    this.target = target;
  }

  async onOpen() {
    this.titleEl.setText(`Delete ${this.target.type} "${this.target.name}"`);
    const layout = this.plugin.layout;
    if (!layout) return;
    await saveOpenNotes(this.app);
    const files = await readInstance(this.app, layout);
    const plan = deletePlan(files, this.plugin.vocabulary, this.plugin.named, layout.model, this.target);
    list(this.contentEl, "Goes to the trash:", plan.removed);
    list(this.contentEl, `References that will name nothing, ${plan.mentions.length}:`, perFile(plan.mentions));
    if (!plan.mentions.length) this.contentEl.createEl("p", { text: "No reference from outside names it." });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText("Delete").setWarning().onClick(async () => {
          if (this.busy) return;
          this.busy = true;
          const item = this.app.vault.getAbstractFileByPath(plan.remove);
          if (item) await this.app.vault.trash(item, true);
          this.close();
          new Notice(`Deleted "${this.target.name}". The pane names what no longer resolves.`);
        }),
      );
  }

  onClose() { this.contentEl.empty(); }
}
