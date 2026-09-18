import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { candidatesFor } from "../src/candidates.ts";
import { example, EXAMPLE } from "./helpers.ts";

const files = example();
const vocabulary = vocabularyOf(schemasOf(files, EXAMPLE));
const names = namesByType(buildModel(files, EXAMPLE).graph!);
const profile = vocabulary.get("profile")!;
const labels = (c: { label: string }[]) => c.map((x) => x.label);

test("a reference value offers the names of its type, those starting with what is typed first", () => {
  const c = candidatesFor({ kind: "value", field: "source", typed: "lo", start: 8 }, profile, names, []);
  assert.deepEqual(c, [{ label: "Local", insert: "Local" }]);
});

test("a name of another type is never offered", () => {
  const c = candidatesFor({ kind: "value", field: "roles", typed: "", start: 4 }, profile, names, []);
  assert.deepEqual(labels(c), ["Backend Engineer", "Reviewer"]);
});

test("an enum value offers what the schema permits", () => {
  const c = candidatesFor({ kind: "value", field: "nature", typed: "", start: 8 }, profile, names, []);
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
  assert.deepEqual(candidatesFor({ kind: "value", field: "source", typed: "", start: 0 }, profile, none, []), []);
  assert.equal(candidatesFor({ kind: "value", field: "nature", typed: "", start: 0 }, profile, none, []).length, 2);
});
