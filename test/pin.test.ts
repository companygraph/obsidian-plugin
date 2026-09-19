// A stale lockfile builds green on an older release than the pin names. It has happened three
// times in this family, so the installed package is held to the pin on every run.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

test("the installed meta-model is the release package.json pins", () => {
  const pin = read("package.json").dependencies["companygraph-meta-model"];
  const tag = pin.match(/^github:companygraph\/meta-model#v(\d+\.\d+\.\d+)$/)?.[1];
  assert.ok(tag, `the pin "${pin}" is not github:companygraph/meta-model#vX.Y.Z`);
  const installed = read("node_modules/companygraph-meta-model/package.json").version;
  assert.equal(installed, tag, "install the package by name so the lockfile moves with the pin");
});

test("the plugin's manifest and package.json carry one version", () => {
  assert.equal(read("manifest.json").version, read("package.json").version);
});

// The Markdown form is one form only while the plugin's markdownlint is the one the conventions'
// CLI runs. conventions-format pins markdownlint-cli2, which pins markdownlint exactly; the pair
// is written here, so a conventions release that moves the CLI fails this until the plugin's
// markdownlint moves with it. Look the new pair up in the CLI's package.json on npm.
const CLI_RUNS: Record<string, string> = { "0.23.2": "0.41.1" };

test("the plugin's markdownlint is the one the conventions' CLI runs", () => {
  const script = fs.readFileSync(path.join(root, "conventions", "conventions-format"), "utf8");
  const cli = script.match(/^VERSION=(\S+)$/m)?.[1];
  assert.ok(cli, "conventions-format names no VERSION");
  assert.ok(CLI_RUNS[cli], `conventions-format runs markdownlint-cli2 ${cli}; add the markdownlint it pins to CLI_RUNS`);
  assert.equal(read("package.json").dependencies.markdownlint, CLI_RUNS[cli]);
  assert.equal(read("node_modules/markdownlint/package.json").version, CLI_RUNS[cli], "install markdownlint by name so the lockfile moves");
});
