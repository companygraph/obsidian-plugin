// Fetches the two repositories the suite runs against into test/fixtures/: companygraph/
// meta-model at the tag package.json pins, for its worked example and core/, and the reference
// instance robertblust/mental-model at one commit, for an instance in the layout every real one
// has. Neither is in node_modules: the package ships lib/ and bin/ only, and an instance is
// content, not a dependency.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const [, metaRepo, tag] = pkg.dependencies["companygraph-meta-model"].match(/^github:([^#]+)#(.+)$/);

// The instance commit is test data and lives here.
const INSTANCE_COMMIT = "70eebb18aa6a3732887ba598e4907c451e3fb229";

const FIXTURES = [
  { repo: metaRepo, ref: tag, url: `https://codeload.github.com/${metaRepo}/tar.gz/refs/tags/${tag}`, dir: "meta-model" },
  { repo: "robertblust/mental-model", ref: INSTANCE_COMMIT, url: `https://codeload.github.com/robertblust/mental-model/tar.gz/${INSTANCE_COMMIT}`, dir: "mental-model" },
];

for (const f of FIXTURES) {
  const target = path.join(root, "test", "fixtures", f.dir);
  const marker = path.join(target, ".ref");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === f.ref) {
    console.log(`fixtures: ${f.repo}@${f.ref.slice(0, 12)} already present`);
    continue;
  }
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  execFileSync("tar", ["-xz", "--strip-components=1", "-C", target], { input: Buffer.from(await res.arrayBuffer()) });
  fs.writeFileSync(marker, f.ref + "\n");
  console.log(`fixtures: ${f.repo}@${f.ref.slice(0, 12)} fetched into test/fixtures/${f.dir}`);
}
