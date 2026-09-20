// What this plugin remembers between sessions, and how it is read back. Pure, and apart from the
// settings tab that draws it: what a stored file may hold is a question about data, and a test
// answers it without Obsidian. Written and read through Obsidian's own `loadData`/`saveData`,
// which is one JSON file in the vault's plugin folder.

export interface Settings {
  replaceObsidianPanes: boolean;
  referencesInDocument: boolean;
  // Which of Obsidian's own panes this plugin itself switched off, so that only those are put
  // back and never one the owner had off already. Remembered here rather than in memory because
  // Obsidian's `disable()` ends in a save of its own: the pane is off in the vault's
  // core-plugins.json after a restart, and a plugin that had forgotten switching it off would
  // find it off, take it for the owner's doing, and never put it back — not when the setting goes
  // off, not on unload, not on uninstall.
  suppressedPanes: string[];
}

export const DEFAULT_SETTINGS: Settings = { replaceObsidianPanes: true, referencesInDocument: false, suppressedPanes: [] };

// The settings as this release declares them, read from whatever `loadData` gives back. Only the
// declared keys are taken and each is held to its type: settings used to be spread, so a vault
// that had run the agent pass still carried that dropped feature's keys, and writing them back
// kept them alive in data.json forever. What a key of the wrong type means is not this plugin's
// to guess, so it falls back to the default. The list is built fresh every time, never shared
// with DEFAULT_SETTINGS, which is one object the whole module hands out.
export function settingsOf(stored: unknown): Settings {
  const held = (stored ?? {}) as Record<string, unknown>;
  const flag = (key: keyof Settings, fallback: boolean) => (typeof held[key] === "boolean" ? (held[key] as boolean) : fallback);
  return {
    replaceObsidianPanes: flag("replaceObsidianPanes", DEFAULT_SETTINGS.replaceObsidianPanes),
    referencesInDocument: flag("referencesInDocument", DEFAULT_SETTINGS.referencesInDocument),
    suppressedPanes: Array.isArray(held.suppressedPanes)
      ? (held.suppressedPanes as unknown[]).filter((id): id is string => typeof id === "string")
      : [],
  };
}

// Whether this vault was last written by a release that did not remember which panes it switched
// off. Such a vault has them off in Obsidian's own settings and no record of it here, and nothing
// would ever put them back, so the panes that are off now are adopted once as this plugin's doing,
// which is what they were. A vault with no stored settings at all is a first run and needs none of
// that: a pane that is off there was off before this plugin ever ran.
export const forgotPanes = (stored: unknown): boolean =>
  stored !== null && typeof stored === "object" && !Array.isArray((stored as { suppressedPanes?: unknown }).suppressedPanes);
