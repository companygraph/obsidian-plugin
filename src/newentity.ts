// New entity (spec §8): a picker of the types a new entity may be made of here, then its name,
// and for a type whose filename takes a field's value, that value too. The file is written where
// the type's folder says, with what its schema requires, and opened with the cursor on the
// tagline. Where and what are scaffold.ts's.
import { FuzzySuggestModal, MarkdownView, Modal, Notice, Setting, TFile } from "obsidian";
import type { App } from "obsidian";
import type { TypeVocabulary } from "./vocabulary.ts";
import { scaffoldOf } from "./scaffold.ts";
import type { Target } from "./scaffold.ts";

export class PickType extends FuzzySuggestModal<Target> {
  targets: Target[];
  vocabulary: Map<string, TypeVocabulary>;

  constructor(app: App, targets: Target[], vocabulary: Map<string, TypeVocabulary>) {
    super(app);
    this.targets = targets;
    this.vocabulary = vocabulary;
    this.setPlaceholder("The type of the new entity");
  }
  getItems() { return this.targets.filter((t) => this.vocabulary.has(t.type)); }
  getItemText(target: Target) { return `${target.type} — ${target.where}`; }
  onChooseItem(target: Target) {
    new NameEntity(this.app, target, this.vocabulary.get(target.type)!).open();
  }
}

class NameEntity extends Modal {
  target: Target;
  vocabulary: TypeVocabulary;
  name = "";
  asked = "";

  constructor(app: App, target: Target, vocabulary: TypeVocabulary) {
    super(app);
    this.target = target;
    this.vocabulary = vocabulary;
  }

  onOpen() {
    this.setTitle(`New ${this.target.type}`);
    const submit = () => void this.create();
    new Setting(this.contentEl).setName("Name").setDesc("The H1, the entity's canonical name").addText((text) => {
      text.onChange((v) => (this.name = v));
      text.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    if (this.target.asks) {
      const asks = this.target.asks;
      new Setting(this.contentEl).setName(asks).setDesc("Its year leads the filename").addText((text) => {
        text.setPlaceholder("YYYY-MM");
        text.onChange((v) => (this.asked = v));
        text.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      });
    }
    new Setting(this.contentEl).addButton((b) => b.setButtonText("Create").setCta().onClick(submit));
  }

  async create() {
    const name = this.name.trim();
    const path = this.target.pathFor(name, this.asked.trim());
    if (!name || !path) {
      new Notice(this.target.asks ? `A name and a ${this.target.asks} that opens with its year are needed.` : "A name is needed.");
      return;
    }
    const vault = this.app.vault;
    if (vault.getAbstractFileByPath(path)) {
      new Notice(`${path} exists already.`);
      return;
    }
    const values: Record<string, string> = {};
    if (this.target.asks) values[this.target.asks] = this.asked.trim();
    const { text, tagline } = scaffoldOf(this.vocabulary, name, values);
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
    const file: TFile = await vault.create(path, text);
    this.close();
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const view = leaf.view instanceof MarkdownView ? leaf.view : null;
    view?.editor.setCursor({ line: tagline, ch: 2 });
    view?.editor.focus();
  }

  onClose() { this.contentEl.empty(); }
}
