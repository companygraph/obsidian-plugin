// New entity (spec §8): a picker of the types a new entity may be made of here, then its name,
// and for a type whose filename takes a field's value, that value too. The file is written where
// the type's folder says, with what its schema requires, and opened with the cursor on the
// tagline. Where and what are scaffold.ts's.
import { FuzzySuggestModal, MarkdownView, Modal, Notice, Setting, TFile } from "obsidian";
import type { App } from "obsidian";
import type { TypeVocabulary } from "./vocabulary.ts";
import { refusedHere, refusedName } from "./names.ts";
import type { Named } from "./scope.ts";
import { scaffoldOf } from "./scaffold.ts";
import type { Target } from "./scaffold.ts";

export class PickType extends FuzzySuggestModal<Target> {
  targets: Target[];
  vocabulary: Map<string, TypeVocabulary>;
  // The last parse's entities and where the model sits, so that the name asked for next can be
  // held to R2 the way Rename entity holds one.
  named: Named[];
  model: string;

  constructor(app: App, targets: Target[], vocabulary: Map<string, TypeVocabulary>, named: Named[], model: string) {
    super(app);
    this.targets = targets;
    this.vocabulary = vocabulary;
    this.named = named;
    this.model = model;
    this.setPlaceholder("The type of the new entity");
  }
  getItems() { return this.targets.filter((t) => this.vocabulary.has(t.type)); }
  getItemText(target: Target) { return `${target.type} — ${target.where}`; }
  onChooseItem(target: Target) {
    new NameEntity(this.app, target, this.vocabulary.get(target.type)!, this.named, this.model).open();
  }
}

class NameEntity extends Modal {
  target: Target;
  vocabulary: TypeVocabulary;
  named: Named[];
  model: string;
  name = "";
  asked = "";
  // Set while a file is being written, so a second Enter or a click does not write it twice.
  busy = false;

  constructor(app: App, target: Target, vocabulary: TypeVocabulary, named: Named[], model: string) {
    super(app);
    this.target = target;
    this.vocabulary = vocabulary;
    this.named = named;
    this.model = model;
  }

  onOpen() {
    // titleEl rather than setTitle, which arrived after the release this plugin supports.
    this.titleEl.setText(`New ${this.target.type}`);
    const submit = () => void this.create();
    new Setting(this.contentEl).setName("Name").setDesc("The H1, the entity's canonical name").addText((text) => {
      text.onChange((v) => (this.name = v));
      text.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing && !e.repeat) submit(); });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    if (this.target.asks) {
      const asks = this.target.asks;
      new Setting(this.contentEl).setName(asks).setDesc("YYYY, YYYY-MM or YYYY-MM-DD; its year leads the filename").addText((text) => {
        text.setPlaceholder("YYYY-MM");
        text.onChange((v) => (this.asked = v));
        text.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing && !e.repeat) submit(); });
      });
    }
    new Setting(this.contentEl).addButton((b) => b.setButtonText("Create").setCta().onClick(submit));
  }

  async create() {
    if (this.busy) return;
    const name = this.name.trim();
    const path = this.target.pathFor(name, this.asked.trim());
    if (!name || !path) {
      new Notice(this.target.asks ? `A name, and a ${this.target.asks} written YYYY, YYYY-MM or YYYY-MM-DD, are needed.` : "A name is needed.");
      return;
    }
    // The guard Rename entity asks. A name it would refuse is one this must not write: a pipe or
    // a leading `#` would break the first cell or field that names this entity, and a name
    // already taken breaks R2. The file's own path is where the name is read from, which is what
    // scopes an owned type's name to its owner.
    const wrong = refusedName(name) ?? refusedHere(this.named, this.model, this.target.type, path, name);
    if (wrong) {
      new Notice(wrong);
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
    this.busy = true;
    let file: TFile;
    try {
      if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
      file = await vault.create(path, text);
    } catch (error) {
      this.busy = false;
      new Notice(`${path} could not be written: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this.close();
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
    const view = leaf.view instanceof MarkdownView ? leaf.view : null;
    view?.editor.setCursor({ line: tagline, ch: 2 });
    view?.editor.focus();
    if (this.target.owes) new Notice(this.target.owes);
  }

  onClose() { this.contentEl.empty(); }
}
