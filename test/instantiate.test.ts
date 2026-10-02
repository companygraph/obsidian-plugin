import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkInstance } from "companygraph-meta-model/checks";
import { carryOut, folderChoices, planInstance, planMove, present } from "../src/instantiate.ts";
import type { Disk, Release } from "../src/instantiate.ts";
import { sha256Hex } from "../src/sha256.ts";
import { UUIDV7 } from "companygraph-meta-model/ids";
// @ts-expect-error: a build script, plain JavaScript with no types.
import { releaseFiles } from "../scripts/release.mjs";

const release: Release = releaseFiles();

// A vault held in memory, as Obsidian's adapter sees one: folders exist on their own, and a file
// can be written only into a folder that does.
function memoryDisk(files: Record<string, string> = {}): Disk & { files: Map<string, string>; folders: Set<string> } {
  const store = new Map(Object.entries(files));
  const folders = new Set<string>([""]);
  for (const path of store.keys()) {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  const parent = (path: string) => path.split("/").slice(0, -1).join("/");
  return {
    files: store,
    folders,
    async exists(path) { return store.has(path) || folders.has(path); },
    async read(path) {
      if (!store.has(path)) throw new Error(`no ${path}`);
      return store.get(path)!;
    },
    async write(path, text) {
      if (!folders.has(parent(path))) throw new Error(`no folder for ${path}`);
      store.set(path, text);
    },
    async mkdir(path) {
      if (!folders.has(parent(path))) throw new Error(`no parent for ${path}`);
      folders.add(path);
    },
    async remove(path) { store.delete(path); },
    async list(path) {
      return {
        files: [...store.keys()].filter((p) => parent(p) === path),
        folders: [...folders].filter((f) => f !== "" && parent(f) === path),
      };
    },
  };
}

test("the release the build carries is the one installed: its version, its core and Claude's skills", () => {
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.ok(release.core["CONVENTIONS.md"] && release.core["manifest.json"]);
  assert.ok(release.core["question-schema.md"], "core 0.40.0 carries the question");
  assert.ok(release.core["decision-schema.md"], "core 0.43.0 carries the decision");
  // The skills are the tooling's and move with it; meta-model v0.44.0 added the profile's, and
  // v0.50.0 the company's and the consent's.
  const skills = new Set(Object.keys(release.skills).map((p) => p.split("/")[0]));
  assert.deepEqual([...skills].sort(), [
    "companygraph-company", "companygraph-consent", "companygraph-export", "companygraph-profile", "companygraph-surface", "companygraph-validate",
  ]);
});

test("a vault made an instance passes the checks, and holds what init writes", async () => {
  const disk = memoryDisk({ "Welcome.md": "# Welcome\n", ".obsidian/app.json": "{}" });
  const plan = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in plan);
  await carryOut(disk, plan.writes, plan.removes);
  assert.equal(disk.files.get("Welcome.md"), "# Welcome\n");
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  assert.equal(manifest.tooling, release.version);
  assert.ok(disk.files.has(".claude/skills/companygraph-validate/SKILL.md"));
  assert.ok(disk.files.get(".github/workflows/companygraph.yml")!.includes(`instance-check.yml@v${release.version}`));
  const checked = new Map([...disk.files].filter(([p]) => p.startsWith("model/") || p.startsWith("meta/core/")));
  assert.deepEqual(checkInstance(checked, { core: "meta/core", model: "model" }).failures, []);
  // Every file the manifest hashes is on disk as hashed.
  for (const [path, hash] of Object.entries(manifest.files as Record<string, string>))
    assert.equal(`sha256:${createHash("sha256").update(disk.files.get(path)!).digest("hex")}`, hash, path);
});

test("the folders offered are the ones init writes when given no choice, and a choice is kept", async () => {
  const all = await planInstance(memoryDisk(), release, { name: "Acme" });
  assert.ok("writes" in all);
  const written = (writes: Map<string, string>) =>
    [...writes.keys()].filter((p) => /^model\/[^/]+\/README\.md$/.test(p)).map((p) => p.split("/")[1]).sort();
  assert.deepEqual(written(all.writes), folderChoices());
  const some = await planInstance(memoryDisk(), release, { name: "Acme", folders: ["values"] });
  assert.ok("writes" in some);
  assert.deepEqual(written(some.writes), ["sources", "values"]);
});

test("a vault that is an instance already is refused, and one whose files would be written over is refused naming them", async () => {
  const instance = await planInstance(memoryDisk({ ".companygraph/manifest.json": "{}" }), release, { name: "Acme" });
  assert.ok("refused" in instance && instance.refused.includes("already"));
  const taken = await planInstance(memoryDisk({ "AGENTS.md": "mine\n" }), release, { name: "Acme" });
  assert.ok("refused" in taken && taken.refused.includes("AGENTS.md"));
});

test("present sees dot-folders the plan writes into, and skips Obsidian's own and git's", async () => {
  const found = await present(memoryDisk({ ".claude/skills/x/SKILL.md": "", ".obsidian/app.json": "", ".git/HEAD": "", "a/b.md": "" }));
  assert.deepEqual([...found].sort(), [".claude/skills/x/SKILL.md", "a/b.md"]);
});

test("moving the core of an instance on this release does nothing, and of an older one moves core, skills, manifest and workflow", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);

  const still = await planMove(disk, release);
  assert.ok("writes" in still);
  assert.equal(still.writes.size, 0);

  // Set back as a vault on an older release would be: one vendored file, one skill, the pins.
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  const older = "# Conventions\n\nAs an older release shipped it.\n";
  disk.files.set("meta/core/CONVENTIONS.md", older);
  manifest.files["meta/core/CONVENTIONS.md"] = `sha256:${sha256Hex(older)}`;
  const skill = ".claude/skills/companygraph-validate/SKILL.md";
  disk.files.set(skill, "# Validate, older\n");
  manifest.files[skill] = `sha256:${sha256Hex("# Validate, older\n")}`;
  manifest.tooling = "0.1.0";
  manifest.core.version = "0.1.0";
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  disk.files.set(".github/workflows/companygraph.yml", disk.files.get(".github/workflows/companygraph.yml")!.replace(/@v[\d.]+/, "@v0.1.0"));

  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  assert.equal(move.from, "0.1.0");
  await carryOut(disk, move.writes, move.removes);
  assert.equal(disk.files.get("meta/core/CONVENTIONS.md"), release.core["CONVENTIONS.md"]);
  assert.equal(disk.files.get(skill), release.skills["companygraph-validate/SKILL.md"]);
  assert.equal(JSON.parse(disk.files.get(".companygraph/manifest.json")!).tooling, release.version);
  assert.ok(disk.files.get(".github/workflows/companygraph.yml")!.includes(`@v${release.version}`));
});

// R18: model/identity.md and model/localization.md are the instance's own and carry no hash, so
// the manifest never names them; `planMove` still has to read them off disk into `held`, the same
// way companygraph's own `upgrade` does, or the planner takes the instance's own page for one it
// was never given and overwrites it with a fresh id on every move.
test("a move never overwrites the localization page a vault already has", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);

  const own = "---\nid: 01965a3e-0000-7000-8000-000000000000\nsource: Local\n---\n\n# Languages\n\n" +
    "> Everyone who reads this model, people and agents alike, reads it in American English.\n\n" +
    "## Locales\n\n| Locale | Role |\n| --- | --- |\n| en-US | primary |\n";
  disk.files.set("model/localization.md", own);

  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  assert.ok(!move.writes.has("model/localization.md"));
  await carryOut(disk, move.writes, move.removes);
  assert.equal(disk.files.get("model/localization.md"), own);
});

test("a move gives a vault from before the localization page one, once, with identity's source", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);

  // An instance from before localization-schema.md existed: no model/localization.md, and its
  // own identity naming a source other than the stub init wrote.
  disk.files.delete("model/localization.md");
  const identity = disk.files.get("model/identity.md")!.replace(/^source: Local$/m, "source: Google Workspace");
  disk.files.set("model/identity.md", identity);

  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  const page = move.writes.get("model/localization.md");
  assert.ok(page, "the move gives the vault a localization page");
  assert.match(page!.split("\n")[1].slice("id: ".length), UUIDV7);
  assert.ok(page!.includes("\nsource: Google Workspace\n"));
  await carryOut(disk, move.writes, move.removes);

  // Given one, a second move leaves it exactly as the first one wrote it.
  const again = await planMove(disk, release);
  assert.ok("writes" in again);
  assert.ok(!again.writes.has("model/localization.md"));
});

test("a vendored file edited in the vault refuses the move, and force takes it", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  manifest.core.version = "0.1.0";
  manifest.tooling = "0.1.0";
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  disk.files.set("meta/core/CONVENTIONS.md", "# Edited here\n");

  const refused = await planMove(disk, release);
  assert.ok("refused" in refused && refused.refused.includes("meta/core/CONVENTIONS.md"));
  const forced = await planMove(disk, release, true);
  assert.ok("writes" in forced && forced.edited!.includes("meta/core/CONVENTIONS.md"));
});

test("a vault that is not an instance has no core to move", async () => {
  const plan = await planMove(memoryDisk(), release);
  assert.ok("refused" in plan && plan.refused.includes("not an instance"));
});

// companygraph/mental-model's case: made before the skills existed, its manifest records none and
// it holds none, and moving its core gives it all three.
test("moving the core of a vault that records no skills and holds none writes them", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  for (const key of Object.keys(manifest.files)) if (key.startsWith(".claude/")) delete manifest.files[key];
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  for (const key of [...disk.files.keys()]) if (key.startsWith(".claude/")) disk.files.delete(key);

  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  await carryOut(disk, move.writes, move.removes);
  for (const path of Object.keys(release.skills))
    assert.equal(disk.files.get(`.claude/skills/${path}`), release.skills[path], path);
  assert.ok(Object.keys(JSON.parse(disk.files.get(".companygraph/manifest.json")!).files).includes(".claude/skills/companygraph-validate/SKILL.md"));
});

// An instance that takes a pack lists the pack's files in its manifest beside core's. The planner
// moves them with core's when it is handed the release's packs, and takes them for foreign
// files when it is not (companygraph/mental-model's case since meta-model 0.68.0).
const PACK_INSTANCE = path.join(import.meta.dirname, "fixtures", "pack-instance");
function packDisk(): ReturnType<typeof memoryDisk> {
  const files: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(PACK_INSTANCE, rel))) {
      const child = rel ? `${rel}/${entry}` : entry;
      if (fs.statSync(path.join(PACK_INSTANCE, child)).isDirectory()) walk(child);
      else if (/^(\.companygraph|meta|\.claude|\.github)\//.test(child) || child === "model/identity.md" || child === "model/localization.md")
        files[child] = fs.readFileSync(path.join(PACK_INSTANCE, child), "utf8");
    }
  };
  walk("");
  return memoryDisk(files);
}

test("the release carries the packs it ships, each as path to text", () => {
  assert.ok(release.packs.software["bounded-context-schema.md"]);
  assert.ok(release.packs.software["manifest.json"]);
});

test("moving the core of an instance that takes a pack moves the pack's files with it, and does not refuse", async () => {
  const disk = packDisk();
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  assert.deepEqual(manifest.packs, ["software"]);
  // The release before this one left the pack's aggregate schema out.
  delete manifest.files["meta/software/aggregate-schema.md"];
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  disk.files.delete("meta/software/aggregate-schema.md");
  const move = await planMove(disk, release);
  assert.ok("writes" in move, "refused" in move ? move.refused : "");
  assert.equal(move.writes.get("meta/software/aggregate-schema.md"), release.packs.software["aggregate-schema.md"]);
  assert.ok(JSON.parse(move.writes.get(".companygraph/manifest.json")!).packs.includes("software"));
});

test("a pack the manifest lists that this release does not ship is refused by name", async () => {
  const disk = packDisk();
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  manifest.packs = ["software", "finance"];
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  const move = await planMove(disk, release);
  assert.ok("refused" in move);
  assert.match(move.refused, /finance/);
  assert.match(move.refused, /software/);
});
