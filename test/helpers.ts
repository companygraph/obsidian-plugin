// The two fixtures as the maps the plugin builds from a vault: path → text, keyed from the
// fixture's root. scripts/fixtures.mjs fetches them; `npm test` runs it first.
import fs from "node:fs";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

function readTree(root: string, folders: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(root, rel))) {
      const child = `${rel}/${entry}`;
      if (fs.statSync(path.join(root, child)).isDirectory()) walk(child);
      else files.set(child, fs.readFileSync(path.join(root, child), "utf8"));
    }
  };
  folders.forEach(walk);
  return files;
}

// Where a fixture keeps its schemas and its container: the shape src/model.ts calls a Layout.
// The meta-model's worked example: a valid instance, core at the repository root.
export const EXAMPLE = { core: "core", model: "example/model" };
export const example = () => readTree(path.join(FIXTURES, "meta-model"), [EXAMPLE.model, EXAMPLE.core]);

// The reference instance: the layout every real instance has.
export const REFERENCE = { core: "meta/core", model: "model" };
export const reference = () => readTree(path.join(FIXTURES, "mental-model"), [REFERENCE.model, REFERENCE.core]);
export const referenceManifest = () =>
  fs.readFileSync(path.join(FIXTURES, "mental-model", ".companygraph", "manifest.json"), "utf8");

// One edit to one file of a map, returned as a new map.
export function edited(files: Map<string, string>, file: string, change: (text: string) => string) {
  const next = new Map(files);
  if (!next.has(file)) throw new Error(`${file} is not in the fixture`);
  next.set(file, change(next.get(file)!));
  return next;
}
