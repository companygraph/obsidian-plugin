import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkInstance } from "companygraph-meta-model/checks";
import { carryOut, folderChoices, moveScope, forceHint, movedSummary, rolesStillNamed, planInstance, planMove, present, readModel, stoppedSaid, doneSaid } from "../src/instantiate.ts";
import type { Disk, Release } from "../src/instantiate.ts";
import { sha256Hex } from "../src/sha256.ts";
import { UUIDV7 } from "companygraph-meta-model/ids";
// @ts-expect-error: a build script, plain JavaScript with no types.
import { releaseFiles } from "../scripts/release.mjs";

const release: Release = releaseFiles();

// A vault held in memory, as Obsidian's adapter sees one: folders exist on their own, and a file
// can be written only into a folder that does. A page is text and any other file is bytes, which
// the adapter keeps apart as well, so `files` holds the pages and `binary` the rest.
function memoryDisk(files: Record<string, string> = {}, bytes: Record<string, Uint8Array> = {}): Disk & { files: Map<string, string>; binary: Map<string, Uint8Array>; folders: Set<string> } {
  const store = new Map(Object.entries(files));
  const binary = new Map(Object.entries(bytes));
  const folders = new Set<string>([""]);
  for (const path of [...store.keys(), ...binary.keys()]) {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  const parent = (path: string) => path.split("/").slice(0, -1).join("/");
  const held = () => [...store.keys(), ...binary.keys()];
  return {
    files: store,
    binary,
    folders,
    async exists(path) { return store.has(path) || binary.has(path) || folders.has(path); },
    async read(path) {
      if (!store.has(path)) throw new Error(`no text ${path}`);
      return store.get(path)!;
    },
    // Obsidian's adapter reads any file as bytes, a page included.
    async readBinary(path) {
      if (store.has(path)) return new TextEncoder().encode(store.get(path)!);
      if (!binary.has(path)) throw new Error(`no bytes ${path}`);
      return binary.get(path)!;
    },
    async write(path, text) {
      if (!folders.has(parent(path))) throw new Error(`no folder for ${path}`);
      store.set(path, text);
    },
    async writeBinary(path, data) {
      if (!folders.has(parent(path))) throw new Error(`no folder for ${path}`);
      binary.set(path, data);
    },
    async mkdir(path) {
      if (!folders.has(parent(path))) throw new Error(`no parent for ${path}`);
      folders.add(path);
    },
    async remove(path) {
      store.delete(path);
      binary.delete(path);
    },
    async rmdir(path) {
      if (held().some((p) => p.startsWith(`${path}/`)) || [...folders].some((f) => f.startsWith(`${path}/`)))
        throw new Error(`${path} is not empty`);
      folders.delete(path);
    },
    async list(path) {
      return {
        files: held().filter((p) => parent(p) === path),
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
  // v0.50.0 the company's and the consent's, and v0.77.0 the judge's.
  const skills = new Set(Object.keys(release.skills).map((p) => p.split("/")[0]));
  assert.deepEqual([...skills].sort(), [
    "companygraph-company", "companygraph-consent", "companygraph-export", "companygraph-judge", "companygraph-profile", "companygraph-surface", "companygraph-validate",
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
  const written = (writes: Map<string, string | Uint8Array>) =>
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

  const own = "---\nid: 01965a3e-0000-7000-8000-000000000000\nsource: Local\nlocale: de-CH\n---\n\n# Sprache\n\n" +
    "> Wer dieses Modell liest, liest es auf Deutsch.\n";
  disk.files.set("model/localization.md", own);

  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  assert.ok(!move.writes.has("model/localization.md"));
  await carryOut(disk, move.writes, move.removes);
  assert.equal(disk.files.get("model/localization.md"), own);
});

// meta-model v0.69.0: a model is written in one language, named in `locale`. A vault whose page is
// still the earlier `## Locales` table has it rewritten once, keeping its id, H1 and statement.
// meta-model v0.70.0: pins.json is the instance's own once it exists, and the move's plan writes
// one only where the vault has none. The plan asks whether it is there, so the move has to say.
test("a move never overwrites the pins.json a vault already has", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);

  const own = '{\n  "pins": []\n}\n';
  disk.files.set("pins.json", own);
  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  assert.ok(!move.writes.has("pins.json"));
  await carryOut(disk, move.writes, move.removes);
  assert.equal(disk.files.get("pins.json"), own);
});

test("a move rewrites a localization page in the earlier form into its locale field, once", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);

  const earlier = "---\nid: 01965a3e-0000-7000-8000-000000000000\nsource: Local\n---\n\n# Languages\n\n" +
    "> Who reads it.\n\n## Locales\n\n| Locale | Role |\n| --- | --- |\n| en-US | primary |\n";
  disk.files.set("model/localization.md", earlier);

  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  await carryOut(disk, move.writes, move.removes);
  assert.equal(disk.files.get("model/localization.md"),
    "---\nid: 01965a3e-0000-7000-8000-000000000000\nsource: Local\nlocale: en-US\n---\n\n# Languages\n\n> Who reads it.\n");

  const again = await planMove(disk, release);
  assert.ok("writes" in again);
  assert.ok(!again.writes.has("model/localization.md"));
});

test("a move that rewrites the localization page says so, and does not call the model untouched", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);
  const plain = await planMove(disk, release);
  assert.ok("writes" in plain);
  assert.equal(moveScope(plain),
    "Only the vendored core, the skills the tooling installed, the manifest and the workflow's tag move. The model is not touched.");

  disk.files.set("model/localization.md", "---\nid: 01965a3e-0000-7000-8000-000000000000\nsource: Local\n---\n\n# Languages\n\n" +
    "> Who reads it.\n\n## Locales\n\n| Locale | Role |\n| --- | --- |\n| en-US | primary |\n");
  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  const said = moveScope(move);
  assert.match(said, /model\/localization\.md is rewritten into the form core [0-9.]+ reads\./);
  assert.doesNotMatch(said, /The model is not touched/);
  assert.match(said, /Nothing else in the model is touched\.$/);
});

test("a move that gives the vault a localization page says so, and does not call the model untouched", async () => {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);
  disk.files.delete("model/localization.md");
  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  const said = moveScope(move);
  assert.match(said, /model\/localization\.md is written, as the vault has none yet\./);
  assert.doesNotMatch(said, /The model is not touched/);
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
  const page = move.writes.get("model/localization.md") as string | undefined;
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
  assert.deepEqual(manifest.packs, ["software", "organization"]);
  // The release before this one left the pack's aggregate schema out.
  delete manifest.files["meta/software/aggregate-schema.md"];
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  disk.files.delete("meta/software/aggregate-schema.md");
  const move = await planMove(disk, release);
  assert.ok("writes" in move, "refused" in move ? move.refused : "");
  assert.equal(move.writes.get("meta/software/aggregate-schema.md"), release.packs.software["aggregate-schema.md"]);
  assert.ok(JSON.parse(move.writes.get(".companygraph/manifest.json") as string).packs.includes("software"));
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

// meta-model v0.87.0: core's `role` became `seat`. A vault written before it holds its seats in
// model/roles/ and names them in a profile's `roles:`; moving it to this core carries both across,
// each page keeping its id, and the planner asks for every file of the model to do it.
const SEAT_PAGE =
  "---\nid: 01965a3e-1111-7000-8000-000000000001\nsource: Local\n---\n\n# Reviewer\n\n> Reads what was written.\n\n## What it takes\n\n- A change.\n\n## What it produces\n\n- A review.\n\n## What it never does\n\n- Merges.\n";
const PROFILE_PAGE =
  "---\nid: 01965a3e-1111-7000-8000-000000000002\nsource: Local\nnature: human\nroles:\n  - Reviewer\n---\n\n# Mira\n\n> Reviews.\n\n## Summary\n\nShe reads.\n";
const PICTURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10, 0x80]);

// A vault on a core from before the rename: made an instance, then set back as one would be, with
// its seats where that core kept them.
async function vaultWithRoles(readme = true) {
  const disk = memoryDisk();
  const made = await planInstance(disk, release, { name: "Acme" });
  assert.ok("writes" in made);
  await carryOut(disk, made.writes, made.removes);
  for (const path of [...disk.files.keys()]) if (path.startsWith("model/seats/")) disk.files.delete(path);
  disk.folders.delete("model/seats");
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  manifest.core.version = "0.62.0";
  manifest.tooling = "0.86.0";
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  disk.files.set(".github/workflows/companygraph.yml", disk.files.get(".github/workflows/companygraph.yml")!.replace(/@v[\d.]+/, "@v0.86.0"));
  disk.folders.add("model/roles");
  if (readme) disk.files.set("model/roles/README.md", "# Roles\n\nThe roles of Acme, in `roles/`.\n");
  disk.files.set("model/roles/reviewer.md", SEAT_PAGE);
  disk.binary.set("model/roles/reviewer.bin", PICTURE);
  disk.folders.add("model/profiles/mira");
  disk.folders.add("model/profiles/mira/experiences");
  disk.files.set("model/profiles/mira/experiences/README.md", "# Experiences\n\nMira's experiences.\n");
  disk.files.set("model/profiles/mira/mira.md", PROFILE_PAGE);
  // A folder that was empty before the move, which the move has no reason to touch.
  disk.folders.add("model/drafts");
  return disk;
}

test("the model is read for the planner: every page as text, and the files of model/roles/ as their bytes", async () => {
  const disk = await vaultWithRoles();
  disk.binary.set("model/skills/diagram.png", PICTURE);
  const model = await readModel(disk);
  assert.equal(model.get("model/roles/reviewer.md"), SEAT_PAGE);
  assert.equal(model.get("model/profiles/mira/mira.md"), PROFILE_PAGE);
  assert.deepEqual(model.get("model/roles/reviewer.bin"), PICTURE);
  assert.ok(!model.has("model/skills/diagram.png"), "a file outside model/roles/ that is no page is not read");
  assert.ok(![...model.keys()].some((p) => !p.startsWith("model/")));
  assert.equal((await readModel(memoryDisk())).size, 0, "a vault with no model/ has none to read");
});

test("a vault that keeps roles is moved to the seats of this core, and model/roles/ is gone", async () => {
  const disk = await vaultWithRoles();
  const move = await planMove(disk, release);
  assert.ok("writes" in move, "refused" in move ? move.refused : "");
  assert.deepEqual(move.moved, [
    ["model/roles/README.md", "model/seats/README.md"],
    ["model/roles/reviewer.bin", "model/seats/reviewer.bin"],
    ["model/roles/reviewer.md", "model/seats/reviewer.md"],
  ]);
  await carryOut(disk, move.writes, move.removes);

  assert.equal(disk.files.get("model/seats/reviewer.md"), SEAT_PAGE, "the seat page keeps its id and its text");
  assert.equal(disk.files.get("model/seats/README.md"), "# Seats\n\nThe roles of Acme, in `seats/`.\n");
  assert.deepEqual(disk.binary.get("model/seats/reviewer.bin"), PICTURE, "a file that is no page moves as the bytes it is");
  const profile = disk.files.get("model/profiles/mira/mira.md")!;
  assert.match(profile, /^seats:\n {2}- Reviewer$/m);
  assert.doesNotMatch(profile, /^roles:/m);
  assert.ok([...disk.files.keys(), ...disk.binary.keys()].every((p) => !p.startsWith("model/roles/")), "nothing is left in model/roles/");
  assert.ok(!disk.folders.has("model/roles"), "the folder the move emptied is taken away");
  assert.ok(disk.folders.has("model"), "model/ itself stays");
  assert.ok(disk.folders.has("model/drafts"), "a folder the move did not empty stays");
  assert.ok(disk.folders.has("model/profiles/mira"));

  // The checks read the moved model against this core: nothing in it still names a role.
  const checked = new Map([...disk.files].filter(([p]) => p.startsWith("model/") || p.startsWith("meta/core/")));
  // Pages only: the bytes are held to equality above, and a file in the model is valid only as a
  // profile's picture, which this one is not.
  assert.deepEqual(checkInstance(checked, { core: "meta/core", model: "model" }).failures, []);

  const again = await planMove(disk, release);
  assert.ok("writes" in again);
  assert.equal(again.writes.size, 0, "a second move has nothing to carry");
  assert.deepEqual(again.moved, []);
});

test("a move that carries roles to seats says so, and what it leaves to the owner", async () => {
  const disk = await vaultWithRoles();
  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  assert.equal(movedSummary(move.moved!), "model/roles/ to model/seats/ (3)");
  const said = moveScope(move);
  assert.match(said, /^The vendored core, the skills the tooling installed, the manifest and the workflow's tag move\./);
  assert.match(said, /The files in model\/roles\/ move to model\/seats\/, each page keeping its id, and model\/roles\/ goes to the trash once it is empty\./);
  assert.doesNotMatch(said, /\(3\)/, "the count is said once, by the line that names the moves");
  assert.match(said, /model\/seats\/README\.md has its heading, folder and schema path changed to the new names; what its prose says about roles is yours to edit\./);
  assert.match(said, /model\/profiles\/mira\/mira\.md is rewritten into the form core [0-9.]+ reads\./);
  assert.doesNotMatch(said, /README\.md[^.]* (?:is|are) rewritten/, "the README is not said rewritten and left to the owner at once");
  assert.match(said, /Nothing else in the model is touched\./);
  assert.match(said, /Files of your own that still say roles, such as README\.md, AGENTS\.md, pages in the model that link into roles\/ and an export guide's \{\{count:Roles\}\}, are yours to edit; nothing here rewrites them, and the command line's upgrade lists them when it makes this move\.$/);
  assert.doesNotMatch(said, /^Only /);
});

// The planner writes a README for the new folder only where the old one had none, and since
// meta-model 0.88.0 lists it among the files it gives, which is where the scope reads it from.
test("a move whose model/roles/ had no README names the README it writes, and does not say the rest of the model is untouched falsely", async () => {
  const disk = await vaultWithRoles(false);
  const move = await planMove(disk, release);
  assert.ok("writes" in move, "refused" in move ? move.refused : "");
  assert.ok(move.writes.has("model/seats/README.md"), "the plan writes a README for the new folder");
  assert.ok(!move.moved!.some(([, to]) => to === "model/seats/README.md"));
  assert.ok(!move.rewritten!.includes("model/seats/README.md"), "a README the plan writes fresh is not one it rewrites");
  assert.ok(move.given!.includes("model/seats/README.md"), "the plan lists the README it writes among the files it gives");
  const said = moveScope(move);
  assert.match(said, /model\/seats\/README\.md is written\./);
  assert.doesNotMatch(said, /heading, folder and schema path/, "a README that was written is not one that moved");
  assert.match(said, /Nothing else in the model is touched\./);
  await carryOut(disk, move.writes, move.removes);
  assert.ok(disk.files.has("model/seats/README.md"));
  // With a README the file is moved, and is not named as written besides.
  const withReadme = moveScope((await planMove(await vaultWithRoles(), release)) as { given?: string[] });
  assert.doesNotMatch(withReadme, /model\/seats\/README\.md is written/);
  // It is read from the plan's given list: a plan that lists it says it, whatever else it holds.
  assert.match(moveScope({ to: "0.64.0", given: ["model/seats/README.md"] }), /model\/seats\/README\.md is written\./);
});

// The command line names the files that still say roles once it has moved them; the preview names
// the same ones before, by reading the vault's text as the move would leave it.
test("the files that still say roles are named in the preview, and only those", async () => {
  const disk = await vaultWithRoles();
  disk.files.set("README.md", "# Acme\n\nOur seats were roles/ once.\n");
  disk.folders.add("docs");
  disk.files.set("docs/export-guide.md", "# Export\n\n{{count:Roles}} people.\n");
  disk.files.set("docs/notes.md", "# Notes\n\nNothing here.\n");
  // A binary file is not read, whatever bytes it holds, and neither is what the vendored units hold.
  disk.binary.set("docs/scan.pdf", new Uint8Array([0x00, ...new TextEncoder().encode("roles/")]));
  disk.files.set("meta/core/NOTE.md", "roles/\n");
  disk.folders.add("node_modules");
  disk.folders.add("node_modules/x");
  disk.files.set("node_modules/x/readme.md", "roles/\n");
  const move = await planMove(disk, release);
  assert.ok("writes" in move, "refused" in move ? move.refused : "");
  const still = await rolesStillNamed(disk, move);
  assert.deepEqual(still, ["README.md", "docs/export-guide.md"]);
  const said = moveScope(move, still);
  assert.match(said, /Files of your own that still say roles: README\.md, docs\/export-guide\.md\. They are yours to edit; nothing here rewrites them, and the command line's upgrade lists them when it makes this move\.$/);
  assert.doesNotMatch(said, /such as/);
});

test("the preview keeps its examples where it finds no file that says roles", async () => {
  const disk = await vaultWithRoles();
  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  const still = await rolesStillNamed(disk, move);
  assert.deepEqual(still, [], "the moved README is rewritten by the move, so it is not one the owner edits for its path");
  assert.match(moveScope(move, still), /Files of your own that still say roles, such as README\.md, AGENTS\.md/);
});

test("a seats README that still uses the word role is named, as the command line names it", async () => {
  const disk = await vaultWithRoles();
  disk.files.set("model/roles/README.md", "# Roles\n\nEach role is a seat of Acme.\n");
  const move = await planMove(disk, release);
  assert.ok("writes" in move);
  assert.deepEqual(await rolesStillNamed(disk, move), ["model/seats/README.md"]);
  assert.match(moveScope(move, ["model/seats/README.md"]), /still say roles: model\/seats\/README\.md\. They are yours to edit/);
});

test("what a move reports counts moved files once: neither as written nor as removed", async () => {
  const move = await planMove(await vaultWithRoles(), release);
  assert.ok("writes" in move);
  const moves = move.moved!.length;
  assert.equal(moves, 3);
  const said = doneSaid(move);
  assert.ok(said.includes(`${move.writes.size - moves} written, ${move.removes.length - moves} removed, 3 moved: model/roles/ to model/seats/ (3)`), said);
  assert.equal(doneSaid({ from: "0.1.0", to: "0.2.0", writes: new Map([["a", "x"]]), removes: ["b"], moved: [] }), "Core 0.1.0 → 0.2.0: 1 written, 1 removed");
});

test("a refusal is followed by the force hint only where it mentions --force", async () => {
  assert.equal(forceHint("meta/core/CONVENTIONS.md was edited in the vault; --force takes it", "0.87.0"),
    "From a terminal, npx github:companygraph/meta-model#v0.87.0 upgrade --force overwrites them.");
  const both = await vaultWithRoles();
  both.folders.add("model/seats");
  both.files.set("model/seats/owner.md", SEAT_PAGE);
  const refused = await planMove(both, release);
  assert.ok("refused" in refused);
  assert.equal(forceHint(refused.refused, "0.87.0"), null, "--force changes nothing for a seat refusal");
  const profile = await vaultWithRoles();
  profile.files.set("model/profiles/mira/mira.md", PROFILE_PAGE.replace("roles:", "seats:\n  - Reviewer\nroles:"));
  const twice = await planMove(profile, release);
  assert.ok("refused" in twice && /carries both `roles` and `seats`/.test(twice.refused));
  assert.equal(forceHint(twice.refused, "0.87.0"), null);
});

test("a move that stops partway says what was written and what to do, by whether anything was removed", () => {
  const moved: [string, string][] = [["model/roles/a.md", "model/seats/a.md"]];
  const before = stoppedSaid({ written: ["model/seats/a.md"], removed: [] }, 3, moved, "disk full");
  assert.match(before, /disk full/);
  assert.match(before, /1 of 3 files written/);
  assert.match(before, /Nothing was removed; the copies in model\/seats\/ can be removed to try again\./);
  const after = stoppedSaid({ written: ["model/seats/a.md", "model/seats/b.md", "x"], removed: ["model/roles/a.md"] }, 3, moved, "locked");
  assert.match(after, /3 of 3 files written/);
  assert.match(after, /1 removed already; look in model\/roles\/ and model\/seats\/ before trying again\./);
  assert.doesNotMatch(stoppedSaid({ written: [], removed: [] }, 1, [], "x"), /model\//);
});

test("pages in model/roles/ and in model/seats/ together refuse the move, and nothing is written", async () => {
  const disk = await vaultWithRoles();
  disk.folders.add("model/seats");
  disk.files.set("model/seats/owner.md", SEAT_PAGE);
  const move = await planMove(disk, release);
  assert.ok("refused" in move);
  assert.match(move.refused, /model\/seats\/ already exists beside model\/roles\//);
});

test("carrying out a plan writes bytes with the binary call and text with the text call, and removes only the folders a removal emptied", async () => {
  const disk = memoryDisk({ "model/a/old.md": "old\n", "model/a/b/keep.md": "keep\n", "model/c/gone.md": "gone\n" });
  await carryOut(disk, new Map<string, string | Uint8Array>([["model/n/new.md", "new\n"], ["model/n/pic.png", PICTURE]]), ["model/a/old.md", "model/c/gone.md"]);
  assert.equal(disk.files.get("model/n/new.md"), "new\n");
  assert.deepEqual(disk.binary.get("model/n/pic.png"), PICTURE);
  assert.ok(!disk.files.has("model/n/pic.png"), "bytes are not written as text");
  assert.ok(!disk.folders.has("model/c"), "model/c/ was emptied by the removal");
  assert.ok(disk.folders.has("model/a"), "model/a/ still holds a folder with a file");
  assert.ok(disk.folders.has("model"));
});

test("a move that rewrites many pages names them by folder, not one by one", () => {
  const rewritten = ["model/profiles/a/a.md", "model/profiles/b/b.md", "model/profiles/c/c.md", "model/seats/README.md"];
  assert.match(moveScope({ to: "0.63.0", rewritten }), /model\/profiles \(3\), model\/seats\/README\.md are rewritten into the form core 0\.63\.0 reads\./);
});

test("a carry-out that throws partway leaves a record of what it had done", async () => {
  const disk = memoryDisk({ "model/roles/a.md": "a\n" });
  const real = disk.write;
  disk.write = async (path, text) => {
    if (path === "model/seats/b.md") throw new Error("disk full");
    return real(path, text);
  };
  const progress = { written: [] as string[], removed: [] as string[] };
  await assert.rejects(
    carryOut(disk, new Map([["model/seats/a.md", "a\n"], ["model/seats/b.md", "b\n"]]), ["model/roles/a.md"], progress),
    /disk full/,
  );
  assert.deepEqual(progress, { written: ["model/seats/a.md"], removed: [] });
  assert.ok(disk.files.has("model/roles/a.md"), "nothing is removed before every write is made");
});

// Meta-model 0.89.0: the landscape pack. The release carries it beside software's, and an
// instance that lists it is moved with it, not refused as a pack the release does not ship.
test("the release ships the landscape pack with its four schemas, and an instance that takes it is not refused", async () => {
  assert.deepEqual(
    Object.keys(release.packs.landscape).filter((f) => f.endsWith("-schema.md")).sort(),
    ["data-object-schema.md", "service-schema.md", "system-kind-schema.md", "system-schema.md"],
  );
  const disk = packDisk();
  const manifest = JSON.parse(disk.files.get(".companygraph/manifest.json")!);
  manifest.packs = [...manifest.packs, "landscape"];
  disk.files.set(".companygraph/manifest.json", JSON.stringify(manifest));
  const move = await planMove(disk, release);
  assert.ok("writes" in move, "refused" in move ? move.refused : "");
  assert.equal(move.writes.get("meta/landscape/system-schema.md"), release.packs.landscape["system-schema.md"]);
});
