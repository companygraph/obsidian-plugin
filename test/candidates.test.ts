import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { candidatesFor, cursorAfter } from "../src/candidates.ts";
import { example, EXAMPLE } from "./helpers.ts";

const files = example();
const vocabulary = vocabularyOf(schemasOf(files, EXAMPLE));
const names = namesByType(buildModel(files, EXAMPLE).graph!);
const profile = vocabulary.get("profile")!;
const labels = (c: { label: string }[]) => c.map((x) => x.label);

test("a reference value offers the names of its type, those starting with what is typed first", () => {
  const c = candidatesFor({ kind: "value", field: "source", typed: "lo", start: 8, item: false }, profile, names, []);
  assert.deepEqual(c, [{ label: "Local", insert: "Local" }]);
});

test("a name of another type is never offered", () => {
  const c = candidatesFor({ kind: "value", field: "roles", typed: "", start: 4, item: true }, profile, names, []);
  assert.deepEqual(labels(c), ["Backend Engineer", "Reviewer"]);
});

test("an enum value offers what the schema permits", () => {
  const c = candidatesFor({ kind: "value", field: "nature", typed: "", start: 8, item: false }, profile, names, []);
  assert.deepEqual(labels(c), ["human", "agent"]);
});

test("a key offers what the file lacks, required first, and a list opens its first entry", () => {
  const lines = ["---", "source: Local", "", "---"];
  const c = candidatesFor({ kind: "key", typed: "", start: 0 }, profile, names, lines);
  assert.ok(!labels(c).includes("source (required)"));
  assert.equal(c[0].label, "nature (required)");
  assert.equal(c.find((x) => x.label === "roles")!.insert, "roles:\n  - ");
});

test("a cell offers by the column's declaration", () => {
  const c = candidatesFor({ kind: "cell", section: "Skills", column: "Level", typed: "pro", start: 0 }, profile, names, []);
  assert.deepEqual(labels(c), ["Proficient"]);
  assert.deepEqual(candidatesFor({ kind: "cell", section: "Skills", column: "Evidence", typed: "", start: 0 }, profile, names, []), []);
});

test("a heading offers the sections the file lacks", () => {
  const c = candidatesFor({ kind: "heading", typed: "", start: 3 }, profile, names, ["## Skills", "## "]);
  assert.ok(!labels(c).some((l) => l.startsWith("Skills")));
  assert.ok(c.length > 0);
});

test("with no parsed graph there are no names, and enum values still come", () => {
  const none = new Map<string, string[]>();
  assert.deepEqual(candidatesFor({ kind: "value", field: "source", typed: "", start: 0, item: false }, profile, none, []), []);
  assert.equal(candidatesFor({ kind: "value", field: "nature", typed: "", start: 0, item: false }, profile, none, []).length, 2);
});

test("a heading already present with two spaces after the ## is not offered again", () => {
  const c = candidatesFor({ kind: "heading", typed: "", start: 3 }, profile, names, ["##  Summary", "## "]);
  assert.ok(!labels(c).some((l) => l.startsWith("Summary")));
});

test("a list field offers its names on an entry of the list and not on the key's own line", () => {
  const key = { kind: "value", field: "roles", typed: "", start: 7, item: false } as const;
  assert.deepEqual(candidatesFor(key, profile, names, []), []);
  assert.deepEqual(labels(candidatesFor({ ...key, item: true }, profile, names, [])), ["Backend Engineer", "Reviewer"]);
});

const role = vocabulary.get("role")!;
const prefixed = new Map([["skill", ["Java", "JavaScript"]]]);

test("a name typed in full leaves nothing to complete, though a longer name still matches it", () => {
  const c = candidatesFor({ kind: "value", field: "requires", typed: "Java", start: 4, item: true }, role, prefixed, []);
  assert.deepEqual(c, []);
});

test("a name typed in part still offers every name it could become", () => {
  const c = candidatesFor({ kind: "value", field: "requires", typed: "Jav", start: 4, item: true }, role, prefixed, []);
  assert.deepEqual(labels(c), ["Java", "JavaScript"]);
});

test("a heading typed in full leaves nothing to complete", () => {
  assert.deepEqual(candidatesFor({ kind: "heading", typed: "Skills", start: 3 }, profile, names, ["## Skills"]), []);
});

test("a heading typed in part is still offered, though the line it is on already reads as a section", () => {
  const c = candidatesFor({ kind: "heading", typed: "Sum", start: 3 }, profile, names, ["## Sum"]);
  assert.deepEqual(labels(c), ["Summary"]);
});

test("the cursor after an insert sits at its end, on the last line it wrote", () => {
  assert.deepEqual(cursorAfter({ line: 3, ch: 8 }, "Local"), { line: 3, ch: 13 });
  assert.deepEqual(cursorAfter({ line: 3, ch: 0 }, "roles:\n  - "), { line: 4, ch: 4 });
  assert.deepEqual(cursorAfter({ line: 0, ch: 2 }, ""), { line: 0, ch: 2 });
});
