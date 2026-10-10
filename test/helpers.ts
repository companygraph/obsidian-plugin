// The two fixtures as the maps the plugin builds from a vault: path → text, keyed from the
// fixture's root. scripts/fixtures.mjs fetches them; `npm test` runs it first.
import fs from "node:fs";
import path from "node:path";
import { IMAGE_FILE } from "companygraph-meta-model/instance";
import type { Files, Layout } from "../src/model.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

// A fixture's pictures, kept beside its notes and not among them: the tests edit text, and a
// map of text is what every module but the checks takes. `whole` puts them back for the checks.
const PICTURES = new Map<string, Uint8Array>();
// The pack instance keeps its own, so that the reference instance's do not stand in its map.
const PACKED_PICTURES = new Map<string, Uint8Array>();
const CONTEXT = "model/bounded-contexts/resolution/resolution.md";

function readTree(root: string, folders: string[], pictures = PICTURES): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(root, rel))) {
      const child = `${rel}/${entry}`;
      if (fs.statSync(path.join(root, child)).isDirectory()) walk(child);
      else if (IMAGE_FILE.test(child)) pictures.set(child, new Uint8Array(fs.readFileSync(path.join(root, child))));
      else files.set(child, fs.readFileSync(path.join(root, child), "utf8"));
    }
  };
  folders.forEach(walk);
  return files;
}

// A map of notes as the vault's reader hands it to the checks: the text, and each picture the
// fixtures hold as bytes (R9). What asserts that no check fails reads this, since a profile
// that names a picture fails without the file.
export const whole = (text: Map<string, string>): Files => new Map<string, string | Uint8Array>([...text, ...PICTURES]);
// The same for the pack instance, whose pictures are its own.
export const wholePacked = (text: Map<string, string>): Files => new Map<string, string | Uint8Array>([...text, ...PACKED_PICTURES]);

// Where a fixture keeps its schemas and its container: the shape src/model.ts calls a Layout.
// The meta-model's worked example: a valid instance, core at the repository root.
// It takes the organization pack since meta-model v0.86.0 and the landscape pack since v0.89.0, whose schemas sit in the repository's packs/.
export const EXAMPLE: Layout = {
  core: "core",
  model: "example/model",
  packs: [
    { name: "organization", dir: "packs/organization" },
    { name: "landscape", dir: "packs/landscape" },
  ],
};
export const example = () => readTree(path.join(FIXTURES, "meta-model"), [EXAMPLE.model, EXAMPLE.core, "packs/organization", "packs/landscape"]);

// The reference instance: the layout every real instance has.
export const REFERENCE: Layout = { core: "meta/core", model: "model" };
export const reference = () => readTree(path.join(FIXTURES, "mental-model"), [REFERENCE.model, REFERENCE.core]);
export const referenceManifest = () =>
  fs.readFileSync(path.join(FIXTURES, "mental-model", ".companygraph", "manifest.json"), "utf8");

// The instance's own pin, for the folders it keeps out of the form. An instance vendors core and
// does not format it, so a test that holds every note to the form reads this first.
export const referencePin = () => fs.readFileSync(path.join(FIXTURES, "mental-model", "conventions.json"), "utf8");

// One edit to one file of a map, returned as a new map.
export function edited(files: Map<string, string>, file: string, change: (text: string) => string) {
  const next = new Map(files);
  if (!next.has(file)) throw new Error(`${file} is not in the fixture`);
  next.set(file, change(next.get(file)!));
  return next;
}

// The instance that takes the software pack, companygraph/mental-model: its pack at
// `meta/software/` beside core, and the first bounded context under `model/`. PACKED is the layout
// src/main.ts builds from a manifest that lists `"packs": ["software", "organization"]`.
export const PACKED: Layout = { core: "meta/core", model: "model", packs: [
    { name: "software", dir: "meta/software" },
    { name: "organization", dir: "meta/organization" },
  ],
};
export const packed = () => readTree(path.join(FIXTURES, "pack-instance"), [PACKED.model, PACKED.core, "meta/software", "meta/organization"], PACKED_PICTURES);
export const packedManifest = () =>
  fs.readFileSync(path.join(FIXTURES, "pack-instance", ".companygraph", "manifest.json"), "utf8");
export { CONTEXT };
