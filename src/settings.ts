// The plugin's own settings tab (spec §8): whether it replaces Obsidian's backlink and outgoing
// links panes, and whether the section under a note is shown. Both persisted through Obsidian's
// own `loadData`/`saveData`, so they are remembered across a restart.
import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";

export interface Settings {
  replaceObsidianPanes: boolean;
  referencesInDocument: boolean;
}

export const DEFAULT_SETTINGS: Settings = { replaceObsidianPanes: true, referencesInDocument: false };

export class CompanyGraphSettingTab extends PluginSettingTab {
  plugin: CompanyGraphPlugin;

  constructor(app: App, plugin: CompanyGraphPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const el = this.containerEl;
    el.empty();

    new Setting(el)
      .setName("Replace Obsidian's backlinks and outgoing links")
      .setDesc(
        "While this vault is a CompanyGraph instance, switch Obsidian's own backlink and " +
          "outgoing-link panes off: the references pane says what they would, for names a " +
          "schema declares.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.replaceObsidianPanes).onChange(async (value) => {
          this.plugin.settings.replaceObsidianPanes = value;
          await this.plugin.saveSettings();
          this.plugin.syncPanes(value && this.plugin.layout !== null);
        }),
      );

    new Setting(el)
      .setName("References in document")
      .setDesc("Show the same two lists under a note, below its own content.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.referencesInDocument).onChange(async (value) => {
          this.plugin.settings.referencesInDocument = value;
          await this.plugin.saveSettings();
          this.plugin.paintInlineRefs();
        }),
      );
  }
}
