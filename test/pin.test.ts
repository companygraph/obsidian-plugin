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
  // The lockfile is what `npm ci` installs, in CI and in a fresh clone: a pin moved by hand
  // leaves it on the old release while the working tree's install says the new one.
  const locked = read("package-lock.json").packages["node_modules/companygraph-meta-model"];
  assert.equal(locked.version, tag, "package-lock.json installs another release than the pin names");
  assert.match(locked.resolved, /^git\+ssh:\/\/git@github\.com\/companygraph\/meta-model\.git#[0-9a-f]{40}$/, "the lockfile resolves the pin to one commit");
  assert.equal(read("package-lock.json").packages[""].dependencies["companygraph-meta-model"], pin, "the lockfile's own copy of the pin");
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

// The plugin bundles this package and declares itself not desktop-only, so the package's syntax
// has to parse where the plugin runs. A regex literal is parsed with the file that holds it, so a
// lookbehind is a syntax error and not a failed match on an engine without one: Safari gained
// lookbehind in 16.4, and one `(?<!!)` in the checks meant the whole bundle failed to parse and
// the plugin did not load at all on an older iPhone. Fixed upstream in 0.32.0; held here, because
// the next release is the one that could bring it back and a phone is where it would be found.
test("nothing in the bundled package uses a lookbehind, which older engines cannot parse", () => {
  const lib = path.join(root, "node_modules", "companygraph-meta-model", "lib");
  const offenders: string[] = [];
  for (const file of fs.readdirSync(lib).filter((f) => f.endsWith(".mjs"))) {
    const lines = fs.readFileSync(path.join(lib, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      // A whole-line comment is not code. Anything else holding `(?<` is, near enough: a named
      // group is written the same way and is no safer on the engines this is about.
      if (!line.trimStart().startsWith("//") && line.includes("(?<")) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], "a lookbehind here stops the whole bundle parsing on iOS before 16.4");
});
