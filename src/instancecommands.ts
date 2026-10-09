// The two modals behind "Make this vault an instance" and "Move this vault's core". Each asks
// what the command line would, shows what will be written before anything is, and carries it out
// on a press. What is written is instantiate.ts's, and through it the meta-model's own planner.
import { Modal, Notice, Setting } from "obsidian";
import type { App, DataAdapter } from "obsidian";
import { carryOut, doneSaid, folderChoices, forceHint, moveScope, movedSummary, planInstance, planMove, rolesStillNamed, stoppedSaid, summary } from "./instantiate.ts";
import type { Disk, Progress, Release } from "./instantiate.ts";

// Obsidian's adapter as the Disk instantiate.ts takes. The adapter lists the root as "/" and
// every other folder by its path, and may hand paths back with a leading slash from the root.
export function diskOf(adapter: DataAdapter): Disk {
  const bare = (path: string) => path.replace(/^\/+/, "");
  return {
    exists: (path) => adapter.exists(path),
    read: (path) => adapter.read(path),
    async readBinary(path) { return new Uint8Array(await adapter.readBinary(path)); },
    write: (path, text) => adapter.write(path, text),
    // The adapter takes an ArrayBuffer of exactly the file's bytes, not the buffer a view sits in.
    writeBinary: (path, bytes) => adapter.writeBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer),
    mkdir: (path) => adapter.mkdir(path),
    remove: (path) => adapter.remove(path),
    // A folder is put in the trash and not deleted. Obsidian's desktop adapter fails a
    // non-recursive rmdir on any folder (EISDIR), and a recursive one is a permanent delete: it
    // would take with it an entry the listing did not show or a file a sync client wrote after
    // it. The trash keeps either, and costs the owner one empty folder to empty from it.
    async rmdir(path) {
      if (!(await adapter.trashSystem(path))) await adapter.trashLocal(path);
    },
    async list(path) {
      const listed = await adapter.list(path === "" ? "/" : path);
      return { files: listed.files.map(bare), folders: listed.folders.map(bare) };
    },
  };
}

export class MakeInstance extends Modal {
  release: Release;
  done: () => void;
  name: string;
  chosen: Set<string>;
  busy = false;

  constructor(app: App, release: Release, done: () => void) {
    super(app);
    this.release = release;
    this.done = done;
    this.name = app.vault.getName();
    this.chosen = new Set(folderChoices());
  }

  onOpen() {
    this.titleEl.setText("Make this vault an instance");
    this.contentEl.createEl("p", {
      text:
        `Writes core ${JSON.parse(this.release.core["manifest.json"]).version} under meta/core/, the manifest, the model's folders ` +
        "and its first three entities, a CI workflow, and Claude's AGENTS.md, CLAUDE.md and three skills. " +
        "Nothing already in the vault is written over.",
    });
    new Setting(this.contentEl).setName("Name").setDesc("The company's name: the H1 of its identity").addText((text) => {
      text.setValue(this.name).onChange((v) => (this.name = v));
    });
    this.contentEl.createEl("h4", { text: "Folders" });
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "A folder for each kind of thing this company has. sources is always written: the first source lives there.",
    });
    for (const folder of folderChoices()) {
      new Setting(this.contentEl).setName(folder).addToggle((toggle) => {
        toggle.setValue(true).setDisabled(folder === "sources").onChange((on) => {
          if (on) this.chosen.add(folder);
          else this.chosen.delete(folder);
        });
      });
    }
    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText("Make it an instance").setCta().onClick(() => void this.make()),
    );
  }

  async make() {
    if (this.busy) return;
    this.busy = true;
    try {
      const disk = diskOf(this.app.vault.adapter);
      const plan = await planInstance(disk, this.release, { name: this.name, folders: [...this.chosen] });
      if ("refused" in plan) {
        new Notice(plan.refused, 10000);
        return;
      }
      await carryOut(disk, plan.writes, plan.removes);
      new Notice(`${plan.writes.size} files written: ${summary([...plan.writes.keys()])}`, 10000);
      this.close();
      this.done();
    } finally {
      this.busy = false;
    }
  }

  onClose() { this.contentEl.empty(); }
}

export class MoveCore extends Modal {
  release: Release;
  done: () => void;
  busy = false;

  constructor(app: App, release: Release, done: () => void) {
    super(app);
    this.release = release;
    this.done = done;
  }

  async onOpen() {
    this.titleEl.setText("Move this vault's core");
    const disk = diskOf(this.app.vault.adapter);
    const plan = await planMove(disk, this.release);
    if ("refused" in plan) {
      // The planner's words, which may end on the command line's --force; from here, the files it
      // names are put back by hand, or the command is run from a terminal.
      this.contentEl.createEl("pre", { text: plan.refused });
      const hint = forceHint(plan.refused, this.release.version);
      if (hint) this.contentEl.createEl("p", { cls: "setting-item-description", text: hint });
      return;
    }
    if (plan.writes.size === 0 && plan.removes.length === 0) {
      this.contentEl.createEl("p", { text: `Already on core ${plan.to}, as this plugin's release writes it. Nothing to move.` });
      return;
    }
    // Read before anything is drawn, so the preview appears whole and never as its first lines.
    const named = await rolesStillNamed(disk, plan);
    this.contentEl.createEl("p", { text: `Core ${plan.from} → ${plan.to}.` });
    this.contentEl.createEl("p", { text: `Writes ${summary([...plan.writes.keys()])}.` });
    const moved = plan.moved ?? [];
    if (moved.length) this.contentEl.createEl("p", { text: `Moves ${movedSummary(moved)}.` });
    // A moved file is removed from where it was and written where it goes, and is named once, as a move.
    const gone = plan.removes.filter((path) => !moved.some(([from]) => from === path));
    if (gone.length) this.contentEl.createEl("p", { text: `Removes ${gone.join(", ")}.` });
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: moveScope(plan, named),
    });
    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText("Move it").setCta().onClick(async () => {
        if (this.busy) return;
        this.busy = true;
        try {
          // Planned again at the press: what was shown is from when the modal opened, and the
          // vault may have changed since.
          const now = await planMove(disk, this.release);
          if ("refused" in now) {
            new Notice(now.refused, 10000);
            return;
          }
          const progress: Progress = { written: [], removed: [] };
          try {
            await carryOut(disk, now.writes, now.removes, progress);
          } catch (error) {
            new Notice(stoppedSaid(progress, now.writes.size, now.moved ?? [], error instanceof Error ? error.message : String(error)), 20000);
            return;
          }
          new Notice(doneSaid(now), 10000);
          this.close();
          this.done();
        } finally {
          this.busy = false;
        }
      }),
    );
  }

  onClose() { this.contentEl.empty(); }
}
