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
      .setName("Replace Obsidian's backlinks, outgoing links and properties panes")
      .setDesc(
        "While this vault is a CompanyGraph instance, switch those three of Obsidian's own panes " +
          "off: the references pane says what the first two would, for the names a schema " +
          "declares, and a vault-wide list of property names is not what an entity is held to. " +
          "The note's own Properties widget stays.",
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
