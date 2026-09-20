import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error - build tooling, plain JavaScript with no types of its own
import { bundled, noticeOf } from "../scripts/notices.mjs";

const root = path.join(import.meta.dirname, "..");

// This plugin ships as one bundled file and is Apache-2.0, and everything compiled into that
// bundle carries a licence asking that its notice travel with any substantial portion of it. A
// bundle is the whole of it. NOTICE is generated from the installed production tree rather than
// written by hand, because a dependency added or moved changes what must be listed and a list
// kept by hand is one that stops being true without saying so.
test("NOTICE names every package the bundle carries, as it is installed now", () => {
  const written = fs.readFileSync(path.join(root, "NOTICE"), "utf8");
  assert.equal(written, noticeOf(root), "NOTICE is stale: run `npm run notices`");
});

test("every bundled package is named with a licence and its own text", () => {
  const written = fs.readFileSync(path.join(root, "NOTICE"), "utf8");
  const packages = bundled(root) as string[];
  assert.ok(packages.length > 0);
  for (const name of packages) assert.ok(written.includes(`${name}@`), `${name} is not in NOTICE`);
  // What the bundle carries today: markdownlint's tree, all MIT, and this family's own parser.
  assert.ok(packages.includes("markdownlint"));
  assert.ok(packages.includes("companygraph-meta-model"));
  // Nothing that only builds the bundle belongs here; it is not in what is shipped.
  for (const dev of ["esbuild", "typescript", "obsidian"]) assert.ok(!packages.includes(dev), dev);
});
