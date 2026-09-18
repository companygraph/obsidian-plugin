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
