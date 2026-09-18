import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { locate } from "../src/locate.ts";
import { example, EXAMPLE, edited } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";
const lineOf = (files: Map<string, string>, file: string, text: string) =>
  files.get(file)!.split("\n").findIndex((l) => l.includes(text));

test("a scalar reference that does not resolve lands on its field's line", () => {
  const files = edited(example(), ROLE, (t) => t.replace("source: Local", "source: Nowhere"));
  const [failure] = buildModel(files, EXAMPLE).failures;
  const at = locate(failure, files);
  assert.equal(at.path, ROLE);
  assert.equal(at.line, lineOf(files, ROLE, "source: Nowhere"));
  assert.ok(!at.message.startsWith(ROLE));
});

test("an entry of a block sequence lands on the entry, not on the key above it", () => {
  const files = edited(example(), ROLE, (t) => t.replace("  - Java Programming", "  - Java Programming\n  - Cobol"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("Cobol"))!;
  assert.equal(locate(failure, files).line, lineOf(files, ROLE, "- Cobol"));
});

test("an undeclared field lands on the field", () => {
  const files = edited(example(), ROLE, (t) => t.replace("source: Local", "source: Local\nbogus: 1"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("bogus"))!;
  assert.equal(locate(failure, files).line, lineOf(files, ROLE, "bogus: 1"));
});

test("a failure that names no file belongs to the instance", () => {
  const at = locate('two skill files share the canonical name "Java Programming"', example());
  assert.deepEqual(at, { path: null, line: 0, message: 'two skill files share the canonical name "Java Programming"' });
});

test("a failure about a folder belongs to the instance", () => {
  assert.equal(locate("example/model/stray/ is not a folder of any type (expected one of skills)", example()).path, null);
});

test("a path with nothing findable in the file falls back to its first line", () => {
  const at = locate(`${ROLE}: no H1, so nothing derives a filename (R2)`, example());
  assert.deepEqual([at.path, at.line], [ROLE, 0]);
});
