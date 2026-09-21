// The two modals behind "Make this vault an instance" and "Move this vault's core". Each asks
// what the command line would, shows what will be written before anything is, and carries it out
// on a press. What is written is instantiate.ts's, and through it the meta-model's own planner.
import { Modal, Notice, Setting } from "obsidian";
import type { App, DataAdapter } from "obsidian";
import { carryOut, folderChoices, planInstance, planMove } from "./instantiate.ts";
import type { Disk, Release } from "./instantiate.ts";

// Obsidian's adapter as the Disk instantiate.ts takes. The adapter lists the root as "/" and
// every other folder by its path, and may hand paths back with a leading slash from the root.
export function diskOf(adapter: DataAdapter): Disk {
  const bare = (path: string) => path.replace(/^\/+/, "");
  return {
    exists: (path) => adapter.exists(path),
    read: (path) => adapter.read(path),
    write: (path, text) => adapter.write(path, text),
    mkdir: (path) => adapter.mkdir(path),
    remove: (path) => adapter.remove(path),
    async list(path) {
      const listed = await adapter.list(path === "" ? "/" : path);
      return { files: listed.files.map(bare), folders: listed.folders.map(bare) };
    },
  };
}

// Paths a plan writes, gathered by folder so a list of fifty files reads in a line or two:
// `meta/core (22)`, `.claude/skills (6)`, and a file alone in its group by its whole path,
// `.companygraph/manifest.json`, `AGENTS.md`.
function summary(paths: string[]): string {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const parts = path.split("/");
    const key = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : path;
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  return [...groups].map(([key, held]) => (held.length > 1 ? `${key} (${held.length})` : held[0])).join(", ");
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
      this.contentEl.createEl("p", {
        cls: "setting-item-description",
        text: `From a terminal, npx github:companygraph/meta-model#v${this.release.version} upgrade --force overwrites them.`,
      });
      return;
    }
    if (plan.writes.size === 0 && plan.removes.length === 0) {
      this.contentEl.createEl("p", { text: `Already on core ${plan.to}, as this plugin's release writes it. Nothing to move.` });
      return;
    }
    this.contentEl.createEl("p", { text: `Core ${plan.from} → ${plan.to}.` });
    this.contentEl.createEl("p", { text: `Writes ${summary([...plan.writes.keys()])}.` });
    if (plan.removes.length) this.contentEl.createEl("p", { text: `Removes ${plan.removes.join(", ")}.` });
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Only the vendored core, the skills the tooling installed, the manifest and the workflow's tag move. The model is not touched.",
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
          await carryOut(disk, now.writes, now.removes);
          new Notice(`Core ${now.from} → ${now.to}: ${now.writes.size} written, ${now.removes.length} removed`, 10000);
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
