// Fetches the three repositories the suite runs against into test/fixtures/: companygraph/
// meta-model at the tag package.json pins, for its worked example and core/; the reference
// instance robertblust/mental-model at one commit, for an instance in the layout every real one
// has; and companygraph/mental-model at another, for an instance that takes the software pack.
// None is in node_modules: the package ships lib/ and bin/ only, and an instance is content, not
// a dependency. The two instances are fetched at commits that hold an earlier core, and are moved
// to the core of the release the package pins by that release's own `upgrade`, as an owner would
// move them, so a fixture is never edited by hand and a re-pin remakes it. And the three files of one release of the Terminal plugin, which
// only the e2e test of Open the command line puts into its vault.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PLUGINS, download } from "companygraph-meta-model/obsidian";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const [, metaRepo, tag] = pkg.dependencies["companygraph-meta-model"].match(/^github:([^#]+)#(.+)$/);

// The instance commit is test data and lives here.
const INSTANCE_COMMIT = "85fa09b7a33ad3212e4dd1964a1ec90b8121e5f7";
// The instance that takes the software pack and holds its bounded contexts, at core 0.60.0.
const PACK_COMMIT = "b01dc66c1cff5ef8ffde5e9072ce0a86dd3d849a";
// The Terminal release whose view state src/main.ts's openCli hands a profile to.
const TERMINAL_RELEASE = "3.27.2";

const FIXTURES = [
  { repo: metaRepo, ref: tag, url: `https://codeload.github.com/${metaRepo}/tar.gz/refs/tags/${tag}`, dir: "meta-model" },
  { repo: "robertblust/mental-model", ref: INSTANCE_COMMIT, url: `https://codeload.github.com/robertblust/mental-model/tar.gz/${INSTANCE_COMMIT}`, dir: "mental-model", upgrade: true },
  { repo: "companygraph/mental-model", ref: PACK_COMMIT, url: `https://codeload.github.com/companygraph/mental-model/tar.gz/${PACK_COMMIT}`, dir: "pack-instance", upgrade: true },
];

// The package's command line, installed beside this script's dependencies.
const CLI = path.join(root, "node_modules", "companygraph-meta-model", "bin", "companygraph.mjs");

for (const f of FIXTURES) {
  const target = path.join(root, "test", "fixtures", f.dir);
  const marker = path.join(target, ".ref");
  // An upgraded fixture is the commit and the release that moved it, so a re-pin remakes it.
  const held = f.upgrade ? `${f.ref} upgraded by ${tag}` : f.ref;
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === held) {
    console.log(`fixtures: ${f.repo}@${f.ref.slice(0, 12)} already present`);
    continue;
  }
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  execFileSync("tar", ["-xz", "--strip-components=1", "-C", target], { input: Buffer.from(await res.arrayBuffer()) });
  if (f.upgrade) {
    // The command prints what it moved; that is read only when it fails.
    // git may not look above the fixtures for a repository, or the command would read this
    // plugin's own git config (its hooks and gate) for a vault that is no part of it.
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.join(root, "test", "fixtures") };
    const moved = spawnSync(process.execPath, [CLI, "upgrade", target], { encoding: "utf8", env });
    if (moved.status !== 0) throw new Error(`upgrade of ${f.dir} failed (${moved.status}):\n${moved.stdout}${moved.stderr}`);
  }
  fs.writeFileSync(marker, held + "\n");
  console.log(`fixtures: ${f.repo}@${f.ref.slice(0, 12)} fetched into test/fixtures/${f.dir}${f.upgrade ? `, moved to the core of ${tag}` : ""}`);
}

const terminal = path.join(root, "test", "fixtures", "terminal");
const terminalMarker = path.join(terminal, ".ref");
if (fs.existsSync(terminalMarker) && fs.readFileSync(terminalMarker, "utf8").trim() === TERMINAL_RELEASE) {
  console.log(`fixtures: Terminal ${TERMINAL_RELEASE} already present`);
} else {
  const files = await download(TERMINAL_RELEASE, fetch, PLUGINS.find((p) => p.id === "terminal"));
  fs.rmSync(terminal, { recursive: true, force: true });
  fs.mkdirSync(terminal, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(terminal, name), content);
  fs.writeFileSync(terminalMarker, TERMINAL_RELEASE + "\n");
  console.log(`fixtures: Terminal ${TERMINAL_RELEASE} fetched into test/fixtures/terminal`);
}
