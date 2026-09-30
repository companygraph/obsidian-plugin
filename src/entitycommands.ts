// Rename entity and Delete entity (spec §8). What either changes is refactor.ts's, worked out
// from the vault as it is when the change is confirmed, after every open note is saved, so that
// nothing typed a moment ago is written over. Both show the plan first and write nothing until it
// is confirmed. The files are changed through the vault, so an open note is reloaded as Obsidian
// reloads any file changed under it, which the heading lock lets through.
import { MarkdownView, Modal, Notice, Setting, TFile } from "obsidian";
import type { App } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import { readInstance } from "./vault.ts";
import { buildModel, textOf } from "./model.ts";
import { namedOf } from "./scope.ts";
import { deletePlan, renamePlan } from "./refactor.ts";
import type { Mention } from "./refactor.ts";
import type { Named } from "./scope.ts";
import { uuidv7 } from "companygraph-meta-model/ids";
import type { EditorView } from "@codemirror/view";
import { freshIdChange, withFreshId } from "./freshid.ts";
import { idOf } from "./idlock.ts";
import { copyId } from "./widget.ts";

async function saveOpenNotes(app: App) {
  const saves: Promise<void>[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof MarkdownView) saves.push(leaf.view.save());
  });
  await Promise.all(saves);
}

// The vault as it is now, and the entity as the model now reads it. The names a plan resolves
// against are parsed from these files, not taken from the last rebuild, which may be a rename
// behind; and the entity is found again by its file, so a name typed into its H1 since is seen.
type Current =
  | { refused: string }
  | {
      layout: NonNullable<CompanyGraphPlugin["layout"]>;
      files: Map<string, string>;
      paths: Set<string>;
      named: Named[];
      now: Named;
    };

async function current(plugin: CompanyGraphPlugin, target: Named): Promise<Current> {
  const layout = plugin.layout;
  if (!layout) return { refused: "This vault is not an instance." };
  await saveOpenNotes(plugin.app);
  const files = await readInstance(plugin.app, layout);
  const graph = buildModel(files, layout).graph;
  if (!graph) return { refused: "The model does not parse now; the pane says why. Mend that first." };
  const named = namedOf(graph);
  const now = named.find((n) => n.path === target.path);
  if (!now) return { refused: `${target.path} is no longer an entity the model holds.` };
  // `paths` is every file the vault holds, pictures included, since a folder that holds only a
  // picture is still a folder in the vault's own eyes even though `textOf` leaves it out.
  return { layout, files: textOf(files), paths: new Set(files.keys()), named, now };
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
    const state = await current(this.plugin, this.target);
    if ("refused" in state) {
      el.createEl("p", { text: state.refused, cls: "companygraph-notice" });
      return;
    }
    const plan = renamePlan(state.files, state.paths, this.plugin.vocabulary, state.named, state.layout.model, state.now, this.name);
    if ("refused" in plan) {
      el.createEl("p", { text: plan.refused, cls: "companygraph-notice" });
      return;
    }
    list(el, "Moves:", plan.moves.map((m) => `${m.from} → ${m.to}`));
    list(el, `References to rewrite, ${plan.mentions.length}:`, perFile(plan.mentions));
    if (!plan.mentions.length) el.createEl("p", { text: "No reference names it." });
  }

  async rename() {
    if (this.busy) return;
    this.busy = true;
    try {
      const state = await current(this.plugin, this.target);
      if ("refused" in state) return void new Notice(state.refused);
      const plan = renamePlan(state.files, state.paths, this.plugin.vocabulary, state.named, state.layout.model, state.now, this.name);
      if ("refused" in plan) return void new Notice(plan.refused);
      const vault = this.app.vault;
      // Every move is checked before anything is written, so a rename is refused whole rather
      // than stopped half done. An owner's inner file is checked at its place before the move.
      for (const [i, move] of plan.moves.entries()) {
        const inMovedFolder = i > 0 && move.from.startsWith(`${plan.moves[0].to}/`);
        const from = inMovedFolder ? plan.moves[0].from + move.from.slice(plan.moves[0].to.length) : move.from;
        if (!vault.getAbstractFileByPath(from)) return void new Notice(`${from} is not in the vault; nothing was changed.`);
        if (vault.getAbstractFileByPath(move.to)) return void new Notice(`${move.to} exists already; nothing was changed.`);
      }
      for (const [path, text] of plan.texts) {
        const file = vault.getAbstractFileByPath(path);
        if (file instanceof TFile && text !== state.files.get(path)) await vault.modify(file, text);
      }
      for (const move of plan.moves) {
        const from = vault.getAbstractFileByPath(move.from);
        if (!from) throw new Error(`${move.from} went missing`);
        await this.app.fileManager.renameFile(from, move.to);
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

  onOpen() {
    this.titleEl.setText(`Delete ${this.target.type} "${this.target.name}"`);
    void this.show().catch((error) => {
      this.contentEl.createEl("p", { text: `The plan could not be made: ${error instanceof Error ? error.message : String(error)}`, cls: "companygraph-notice" });
    });
  }

  async show() {
    const state = await current(this.plugin, this.target);
    if ("refused" in state) {
      this.contentEl.createEl("p", { text: state.refused, cls: "companygraph-notice" });
      return;
    }
    const plan = deletePlan(state.files, state.paths, this.plugin.vocabulary, state.named, state.layout.model, state.now);
    if ("refused" in plan) {
      this.contentEl.createEl("p", { text: plan.refused, cls: "companygraph-notice" });
      return;
    }
    list(this.contentEl, "Deleted, as this vault deletes:", plan.removed);
    list(this.contentEl, `References that will name nothing, ${plan.mentions.length}:`, perFile(plan.mentions));
    if (!plan.mentions.length) this.contentEl.createEl("p", { text: "No reference from outside names it." });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText("Delete").setWarning().onClick(async () => {
          if (this.busy) return;
          this.busy = true;
          try {
            const item = this.app.vault.getAbstractFileByPath(plan.remove);
            if (!item) {
              new Notice(`${plan.remove} is no longer in the vault; nothing was deleted.`);
              return;
            }
            // The owner's own setting for a deleted file decides where it goes, which is what
            // `trashFile` reads: the system bin, the vault's own `.trash`, or gone outright.
            // `vault.trash(item, true)` forced the system bin and ignored that, so a vault set to
            // keep its deletions inside itself sent them somewhere the owner does not look.
            await this.app.fileManager.trashFile(item);
            this.close();
            new Notice(`Deleted "${state.now.name}". The pane names what no longer resolves.`);
          } catch (error) {
            new Notice(`Nothing was deleted: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            this.busy = false;
          }
        }),
      );
  }

  onClose() { this.contentEl.empty(); }
}

// Give this page a fresh id (spec §8). The one way the plugin changes an id, which R18 otherwise
// never does, so it asks first and says what is at stake. On the author's word it replaces the
// value of the page's `id:` line in the editor, with the event `input.id` the lock lets through
// and follows, so the page is locked again on the new id, and puts the new id on the clipboard.
export class FreshId extends Modal {
  view: MarkdownView;

  constructor(app: App, view: MarkdownView) {
    super(app);
    this.view = view;
  }

  onOpen() {
    this.titleEl.setText("Give this page a fresh id");
    const current = idOf(this.view.getViewData());
    this.contentEl.createEl("p", {
      text: current
        ? `Its id ${current} is replaced by a new one, and anything outside the model that holds the old id will no longer find this page.`
        : "It is given an id where it has none, and anything outside the model will find it by that id from now on.",
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText("Confirm").setWarning().onClick(() => {
          this.close();
          void this.write().catch((error: unknown) =>
            new Notice(`The page's id is unchanged: ${error instanceof Error ? error.message : String(error)}`));
        }),
      );
  }

  // Written as the view writes: in Reading view no editor holds the text that is saved, so it goes
  // the way the Properties widget's own write goes there, into the view and then to the file,
  // which no lock of this plugin's stands in; elsewhere into the editor with `input.id`. The new
  // id is announced and copied only once the view holds it and the file does.
  async write() {
    const view = this.view;
    const file = view.file;
    if (!file) throw new Error("the note has no file");
    const id = uuidv7();
    if (view.getMode() === "preview") {
      const internal = view as unknown as { onInternalDataChange?: () => void };
      view.setViewData(withFreshId(view.getViewData(), id), false);
      internal.onInternalDataChange?.();
    } else {
      const cm = (view.editor as unknown as { cm?: EditorView }).cm;
      if (!cm) throw new Error("the page's editor could not be reached");
      cm.dispatch({ changes: freshIdChange(cm.state.doc.toString(), id), userEvent: "input.id" });
    }
    if (idOf(view.getViewData()) !== id) throw new Error("the new id did not reach the page");
    // The page holds it from here on, so a save that fails, or one already under way that writes
    // it a moment later, is said as such and not as an id left unchanged; nor is it copied then.
    let saved = false;
    try {
      await view.save();
      saved = idOf(await this.app.vault.read(file)) === id;
    } catch {
      saved = false;
    }
    if (!saved) {
      new Notice(`The new id ${id} is in the page but has not reached the file yet.`);
      return;
    }
    copyId(id, "the page's new id");
  }

  onClose() { this.contentEl.empty(); }
}
