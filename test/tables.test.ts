import test from "node:test";
import assert from "node:assert/strict";
import { cellContextOf, sectionAbove, tableRowOf, cellOfFailure, cellOfLine, columnDeclared } from "../src/tables.ts";
import { contextAt } from "../src/context.ts";

const NOTE = [
  "---", "source: Local", "---", "",   // 0-3
  "# Mira", "",                        // 4-5
  "## Summary", "", "Prose.", "",      // 6-9
  "## Skills", "",                     // 10-11
  "| Skill | Level | Evidence |",     // 12
  "| --- | --- | --- |",              // 13
  "| Java | Expert | built it |",     // 14
  "| Go | Ex |  |",                   // 15
];
const at = (lines: string[]) => (n: number) => lines[n];
const TABLE = NOTE.slice(12).join("\n");

test("the section a line sits under is the nearest ## heading above it, read one line at a time", () => {
  assert.equal(sectionAbove(at(NOTE), 12), "Skills");
  assert.equal(sectionAbove(at(NOTE), 8), "Summary");
  assert.equal(sectionAbove(at(NOTE), 4), null);
  assert.equal(sectionAbove(at(NOTE), -1), null);
  assert.equal(sectionAbove(at([]), 0), null);
});

test("a body cell of a table in Live Preview is a cell context named by the header the package reads", () => {
  assert.deepEqual(cellContextOf({ table: TABLE, row: 2, col: 1, section: "Skills", lines: 1, line: "Ex", ch: 2 }),
    { kind: "cell", section: "Skills", column: "Level", typed: "Ex", start: 0, row: { Skill: "Go", Level: "Ex", Evidence: "" } });
  assert.deepEqual(cellContextOf({ table: TABLE, row: 1, col: 0, section: "Skills", lines: 1, line: "  Ja", ch: 4 }),
    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 2, row: { Skill: "Java", Level: "Expert", Evidence: "built it" } });
});

// The one test that holds the two ways into a cell together: Source mode reads the row's pipes,
// Live Preview is told the row and the column, and both must name the same context.
test("Source mode and Live Preview reach the same context for the same cell", () => {
  const source = contextAt(NOTE, 15, "| Go | Ex".length);
  const live = cellContextOf({ table: TABLE, row: 2, col: 1, section: sectionAbove(at(NOTE), 12), lines: 1, line: "Ex", ch: 2 });
  assert.ok(source && live && source.kind === "cell" && live.kind === "cell");
  assert.deepEqual([live.section, live.column, live.typed, live.row], [source.section, source.column, source.typed, source.row]);
});

test("a table the package does not read as one gives no context in either mode", () => {
  const aligned = ["## Skills", "", "| Skill | Level |", "| :--- | ---: |", "| Ja"];
  assert.equal(contextAt(aligned, 4, 4), null);
  assert.equal(cellContextOf({ table: aligned.slice(2).join("\n"), row: 1, col: 0, section: "Skills", lines: 1, line: "Ja", ch: 2 }), null);
});

test("the header row, no section, a column past the header, text after the cursor and a cell of several lines give none", () => {
  const base = { table: TABLE, section: "Skills" as string | null, lines: 1 };
  assert.equal(cellContextOf({ ...base, row: 0, col: 0, line: "Ski", ch: 3 }), null);
  assert.equal(cellContextOf({ ...base, section: null, row: 1, col: 0, line: "Ja", ch: 2 }), null);
  assert.equal(cellContextOf({ ...base, row: 1, col: 5, line: "Ja", ch: 2 }), null);
  assert.equal(cellContextOf({ ...base, row: 1, col: 0, line: "Java", ch: 2 }), null);
  assert.equal(cellContextOf({ ...base, lines: 2, row: 1, col: 0, line: "Ja", ch: 2 }), null);
  assert.deepEqual(cellContextOf({ ...base, row: 1, col: 0, line: "Ja  ", ch: 2 }),
    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 0, row: { Skill: "Java", Level: "Expert", Evidence: "built it" } });
});

test("a failing line is a row of the table widget drawn from its first line", () => {
  assert.deepEqual(tableRowOf(12, 12, 4), { kind: "header" });
  assert.deepEqual(tableRowOf(13, 12, 4), { kind: "header" });   // the separator has no row of its own
  assert.deepEqual(tableRowOf(14, 12, 4), { kind: "body", index: 0 });
  assert.deepEqual(tableRowOf(15, 12, 4), { kind: "body", index: 1 });
  assert.equal(tableRowOf(16, 12, 4), null);
  assert.equal(tableRowOf(11, 12, 4), null);
});

test("a failure in a table row names its cell: the row as the widget counts it, the column from the message", () => {
  const lines = ["## Skills", "", "| Skill | Level |", "| --- | --- |", "| Java | Exprt |", "| Go | Expert |", ""];
  const message = '`Level` in "## Skills" is declared `qualifier → proficiency-level` and says "Exprt"';
  assert.deepEqual(cellOfFailure(lines, 4, message), { first: 2, row: 1, col: 1 });
  assert.deepEqual(cellOfFailure(lines, 5, "says nothing of a column"), { first: 2, row: 2, col: 0 });
  // The header and the separator are the header row; a line outside a table is no cell.
  assert.deepEqual(cellOfFailure(lines, 3, message), { first: 2, row: 0, col: 1 });
  assert.equal(cellOfFailure(lines, 0, message), null);
});

// Found in the owner's use: a reference opened from the references pane landed in the row's first
// cell whatever column the name stood in, so a level or an experience opened on the skill beside it.
test("a mention in a table row names its cell: the column is the one that declares the name", () => {
  const lines = ["## Skills", "", "| Skill | Level |", "| --- | --- |", "| Java | Expert |", "| Go | Expert |", ""];
  assert.deepEqual(cellOfLine(lines, 5, "Level"), { first: 2, row: 2, col: 1 });
  assert.deepEqual(cellOfLine(lines, 5, "Skill"), { first: 2, row: 2, col: 0 });
  // A column the table does not have, or none named, is the row's first cell; no table, no cell.
  assert.deepEqual(cellOfLine(lines, 4, "Evidence"), { first: 2, row: 1, col: 0 });
  assert.deepEqual(cellOfLine(lines, 4, null), { first: 2, row: 1, col: 0 });
  assert.equal(cellOfLine(lines, 0, "Level"), null);
});

test("what declares a name says which column it stands in, and a field names none", () => {
  assert.equal(columnDeclared("## Evidence · Experience"), "Experience");
  assert.equal(columnDeclared("Skills · Level"), "Level");   // as a list shows it, without the hashes
  assert.equal(columnDeclared("requires"), null);
  assert.equal(columnDeclared("## Phases"), null);           // the heading of a grouped section
});
