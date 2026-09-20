import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { namedOf } from "../src/scope.ts";
import { referencesIn, resolveIn, cellAt, chOfCell } from "../src/references.ts";
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

// Review found these. A comment after a value is YAML's and not the name's. And a cell is split
// as the package's table reader splits a row, on every pipe, so a column here is the column the
// checks read.
test("a comment after a value is not part of the name", () => {
  const text = ["---", "source: Local # the only source", "---", "", "## Skills", "", "| Skill | Level |", "| --- | --- |", "| Cobol | Expert |"];
  assert.deepEqual(referencesIn(text, vocabulary.get("profile")!).map((r) => r.name), ["Local", "Cobol", "Expert"]);
});

// A fence is nothing to the package: `sectionsOf` splits on `## ` line by line and `blocksOf`
// reads every run of lines opening with a pipe, so the checks hold a row inside a fence like any
// other. This read it as code, which left a row no rename could reach, and the toggle never reset
// at a section, so one unclosed fence hid the rest of the note.
test("a table in fenced code is read as the checks read it, and a fence hides nothing after it", () => {
  const fenced = ["---", "---", "", "## Skills", "", "```", "| Skill | Level |", "| --- | --- |", "| Cobol | Expert |", "```"];
  assert.deepEqual(referencesIn(fenced, vocabulary.get("profile")!).map((r) => r.name), ["Cobol", "Expert"]);
  const unclosed = ["---", "---", "", "## Skills", "", "```", "an example", "", "| Skill | Level |", "| --- | --- |", "| Cobol | Expert |"];
  assert.deepEqual(referencesIn(unclosed, vocabulary.get("profile")!).map((r) => r.name), ["Cobol", "Expert"]);
});

test("a cell is split on every pipe, as the checks split it", () => {
  const text = ["---", "---", "", "## Skills", "", "| Skill | Level |", "| --- | --- |", "| Java \\| x | Expert |"];
  const found = referencesIn(text, vocabulary.get("profile")!).map((r) => [r.name, r.target]);
  assert.deepEqual(found, [["Java \\", "skill"], ["x", "proficiency-level"]]);
});

// A `#` is a comment only in YAML, only after a space, and never inside quotes. A table cell has
// no comments at all, so a name there may hold one.
test("a # in a table cell or inside quotes is part of the name", () => {
  const text = ["---", 'source: "Rock # 1"', "---", "", "## Skills", "", "| Skill | Level |", "| --- | --- |", "| C # Programming | Proficient |"];
  assert.deepEqual(referencesIn(text, vocabulary.get("profile")!).map((r) => r.name), ["Rock # 1", "C # Programming", "Proficient"]);
});

// Found in the owner's trial: an experience's `organization` is declared `ref? → identity`. It
// draws an edge when it names the company the instance describes and stays a fact when it names
// anyone else, so a client's name there is no broken link and is not drawn as one. The span still
// says it was written in an optional reference; what is drawn of it is namelinks.ts's.
test("a value in an optional reference is marked optional, and its own vocabulary says so", () => {
  const exp = ["---", "source: Local", "kind: Role", "organization: A client", "start: 2020", "---"];
  const found = referencesIn(exp, vocabulary.get("experience")!).find((r) => r.name === "A client")!;
  assert.equal(found.target, "identity");
  assert.equal(found.optional, true);
  const source = referencesIn(exp, vocabulary.get("experience")!).find((r) => r.name === "Local")!;
  assert.equal(source.optional, false);
});

test("a `###` heading of a grouped section is a reference to what the section names", () => {
  const v = vocabularyOf(schemasOf(example(), EXAMPLE)).get("experience")!;
  const lines = ["---", "source: Local", "---", "", "# A", "", "## Achievements", "", "### Leadership  ", "", "- Led.", "", "## Summary", "", "### Not one"];
  const refs = referencesIn(lines, v).filter((r) => r.target === "achievement-kind");
  assert.deepEqual(refs.map((r) => [r.line, r.from, r.to, r.name]), [[8, 4, 14, "Leadership"]]);
});

test("a grouped heading in fenced code is read as the parser reads it, so a rename reaches it", () => {
  const v = vocabularyOf(schemasOf(example(), EXAMPLE)).get("experience")!;
  const lines = ["# A", "", "## Achievements", "", "```", "### Leadership", "```"];
  assert.deepEqual(referencesIn(lines, v).map((r) => r.name), ["Leadership"]);
});

// Found in the owner's use: a name in a cell being edited was drawn as one that names nothing. A
// cell being edited holds its drawn text and its own editor, and the mark read both, the name
// twice over. The mark is put on the screen's cell but read from the note, so which cell of its
// row a reference stands in has to be known from the line.
test("a reference in a row says which cell it stands in, counted as the row is split", () => {
  const text = ["## Skills", "", "| Skill | Level |", "| --- | --- |", "| Cobol | Expert |", "|  | Expert |"];
  const found = referencesIn(text, vocabulary.get("profile")!);
  assert.deepEqual(found.map((r) => [r.name, cellAt(text[r.line], r.from)]), [["Cobol", 0], ["Expert", 1], ["Expert", 1]]);
  // Outside every cell: before the first pipe, and on a line that has none.
  assert.equal(cellAt("x | Cobol | Expert |", 0), null);
  assert.equal(cellAt("source: Local", 8), null);
});

// Found in the owner's use: Cmd+S in a cell of a long table left the table padded and the cursor
// in the table's last row. The form replaces a run of changed lines whole, which carries the
// note's own cursor to the run's edge, a line's start, in no cell; Obsidian then moves it into
// the last row and pads the table again. So the cursor is put back where the cell's cursor
// stands, and that place has to be found on the row as the form wrote it.
test("a cursor in a cell is a place on its row: past the pipe and the space after it", () => {
  const row = "| Cobol | Expert   |";
  assert.equal(chOfCell(row, 0, 0), 2);
  assert.equal(chOfCell(row, 0, 3), 5);
  assert.equal(chOfCell(row, 1, 6), 16);
  // No further than the cell's words, whatever padding follows them; an empty cell is its start.
  assert.equal(chOfCell(row, 1, 40), 16);
  assert.equal(chOfCell("| Cobol |  |", 1, 0), 10);
  // A column the row does not have is no place.
  assert.equal(chOfCell(row, 2, 0), null);
  assert.equal(chOfCell("source: Local", 0, 0), null);
});
