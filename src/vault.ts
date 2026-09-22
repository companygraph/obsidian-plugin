// The vault as the map the parser and the checks take. The only file here that reads anything.
import type { App } from "obsidian";
import { IMAGE_FILE } from "companygraph-meta-model/instance";
import { readManifest } from "./manifest.ts";
import type { InstanceManifest } from "./manifest.ts";
import type { Files, Layout } from "./model.ts";

export const MANIFEST = ".companygraph/manifest.json";

// What is read as text. An image is read as bytes, because the checks hold one from its own
// header (R9) and text would be a corrupted picture. Anything else enters the map with empty
// text: the structure check asks only whether a stray file is there, never what it holds.
const TEXT = new Set(["md", "json", "txt", "yml", "yaml"]);

// Obsidian keeps dot-folders out of the vault's file list, so the manifest is read through the
// adapter, which works on every platform. null: no manifest, so this vault is not an instance.
export async function loadManifest(app: App): Promise<InstanceManifest | null> {
  if (!(await app.vault.adapter.exists(MANIFEST))) return null;
  return readManifest(await app.vault.adapter.read(MANIFEST));
}

export const concerns = (path: string, layout: Layout) =>
  path.startsWith(layout.model + "/") || path.startsWith(layout.core + "/");

export async function readInstance(app: App, layout: Layout): Promise<Files> {
  const files: Files = new Map();
  for (const file of app.vault.getFiles()) {
    if (!concerns(file.path, layout)) continue;
    if (IMAGE_FILE.test(file.path)) files.set(file.path, new Uint8Array(await app.vault.readBinary(file)));
    else files.set(file.path, TEXT.has(file.extension) ? await app.vault.cachedRead(file) : "");
  }
  return files;
}
