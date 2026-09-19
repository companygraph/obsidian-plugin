// The agent's program and model (spec: "Finding the program"). Empty, the program is looked for
// where Claude Code installs to; empty, the model is the program's own default.
import { PluginSettingTab, Setting } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";

export interface Settings { program: string; model: string }
export const DEFAULTS: Settings = { program: "", model: "" };

export class CompanyGraphSettings extends PluginSettingTab {
  plugin: CompanyGraphPlugin;

  constructor(plugin: CompanyGraphPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    const el = this.containerEl;
    el.empty();
    new Setting(el).setName("The agent pass").setHeading();
    new Setting(el)
      .setName("Claude Code")
      .setDesc("The path to the claude program. Empty, the places Claude Code installs to are tried: ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.")
      .addText((t) => t.setPlaceholder("found where it installs").setValue(this.plugin.settings.program).onChange(async (v) => {
        this.plugin.settings.program = v;
        await this.plugin.saveAll();
      }));
    new Setting(el)
      .setName("Model")
      .setDesc("Passed as --model. Empty, Claude Code's own default.")
      .addText((t) => t.setPlaceholder("default").setValue(this.plugin.settings.model).onChange(async (v) => {
        this.plugin.settings.model = v;
        await this.plugin.saveAll();
      }));
  }
}
