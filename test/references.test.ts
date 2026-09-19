import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { namedOf } from "../src/scope.ts";
import { referencesIn, resolveIn } from "../src/references.ts";
import { example, EXAMPLE } from "./helpers.ts";

const files = example();
const vocabulary = vocabularyOf(schemasOf(files, EXAMPLE));
const named = namedOf(buildModel(files, EXAMPLE).graph!);
const MIRA = "example/model/profiles/mira-halvorsen/mira-halvorsen.md";
const lines = files.get(MIRA)!.split("\n");
const refs = referencesIn(lines, vocabulary.get("profile")!);
// Lines are counted from zero, as the module counts them.
const at = (line: number) => refs.filter((r) => r.line === line).map((r) => [r.name, r.target, lines[line].slice(r.from, r.to)]);

// Which spans of a file are references is decided from the vocabulary: a field, a list entry
// or a table cell whose declaration names a type. The span is the name as written, so a
// decoration covers it exactly and nothing beside it.
test("a reference field's value is a reference, and a string field's is not", () => {
  assert.deepEqual(at(1), [["Google Workspace", "source", "Google Workspace"]]);
  assert.deepEqual(at(2), [], "source-id is a string");
  assert.deepEqual(at(6), [], "email is a string");
});

test("each entry of a list of references is a reference, and its key line is not", () => {
  assert.deepEqual(at(4), []);
  assert.deepEqual(at(5), [["Backend Engineer", "role", "Backend Engineer"]]);
});

test("a table cell is a reference by its column's declaration, a qualifier as much as a reference", () => {
  assert.deepEqual(at(18), [["Java Programming", "skill", "Java Programming"], ["Proficient", "proficiency-level", "Proficient"]]);
  assert.deepEqual(at(25), [["Java Programming", "skill", "Java Programming"], ["Rebuilding the order pipeline", "experience", "Rebuilding the order pipeline"]]);
});

test("a header row, a separator row, a prose column and a table no column of which is a reference give none", () => {
  for (const line of [16, 17, 23, 24, 36, 37, 38]) assert.deepEqual(at(line), [], `line ${line}`);
});

test("quotes around a value are not part of the name, and an empty value is no reference", () => {
  const quoted = ["---", 'source: "Local"', "roles:", "  - ", "---"];
  const found = referencesIn(quoted, vocabulary.get("profile")!);
  assert.deepEqual(found.map((r) => [r.line, r.name, quoted[r.line].slice(r.from, r.to)]), [[1, "Local", "Local"]]);
});

test("a line in the body that reads like a field, and a table under no section, are not read", () => {
  const body = ["---", "---", "", "source: Local", "", "| Skill | Level |", "| --- | --- |", "| Java Programming | Expert |"];
  assert.deepEqual(referencesIn(body, vocabulary.get("profile")!), []);
});

// A name resolves as the checks resolve it: by its declared type, and for an owned type within
// the owner the file is in.
test("a name resolves to the file of the entity it names, within its scope", () => {
  assert.equal(resolveIn(named, MIRA, EXAMPLE.model, "skill", "Java Programming"), "example/model/skills/java-programming.md");
  assert.equal(resolveIn(named, MIRA, EXAMPLE.model, "experience", "Rebuilding the order pipeline")?.startsWith("example/model/profiles/mira-halvorsen/experiences/"), true);
  const tomas = "example/model/profiles/tomas-reyes/tomas-reyes.md";
  assert.equal(resolveIn(named, tomas, EXAMPLE.model, "experience", "Rebuilding the order pipeline"), null, "another owner's experience");
  assert.equal(resolveIn(named, MIRA, EXAMPLE.model, "skill", "Cobol"), null);
  assert.equal(resolveIn(named, MIRA, EXAMPLE.model, "role", "Java Programming"), null, "a name under another type");
});

// Review found these. A comment after a value is YAML's and not the name's. A fenced block is
// code: a heading or a table in it is not the note's. And a cell is split as the package's table
// reader splits a row, on every pipe, so a column here is the column the checks read.
test("a comment after a value is not part of the name, and a fenced block is code", () => {
  const text = ["---", "source: Local # the only source", "---", "", "```", "## Skills", "| Skill | Level |", "| --- | --- |", "| Cobol | Expert |", "```"];
  assert.deepEqual(referencesIn(text, vocabulary.get("profile")!).map((r) => r.name), ["Local"]);
});

test("a cell is split on every pipe, as the checks split it", () => {
  const text = ["---", "---", "", "## Skills", "", "| Skill | Level |", "| --- | --- |", "| Java \\| x | Expert |"];
  const found = referencesIn(text, vocabulary.get("profile")!).map((r) => [r.name, r.target]);
  assert.deepEqual(found, [["Java \\", "skill"], ["x", "proficiency-level"]]);
});
