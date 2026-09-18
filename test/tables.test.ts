import test from "node:test";
import assert from "node:assert/strict";
import { cellContextOf, sectionAbove, tableRowOf } from "../src/tables.ts";
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
    { kind: "cell", section: "Skills", column: "Level", typed: "Ex", start: 0 });
  assert.deepEqual(cellContextOf({ table: TABLE, row: 1, col: 0, section: "Skills", lines: 1, line: "  Ja", ch: 4 }),
    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 2 });
});

// The one test that holds the two ways into a cell together: Source mode reads the row's pipes,
// Live Preview is told the row and the column, and both must name the same context.
test("Source mode and Live Preview reach the same context for the same cell", () => {
  const source = contextAt(NOTE, 15, "| Go | Ex".length);
  const live = cellContextOf({ table: TABLE, row: 2, col: 1, section: sectionAbove(at(NOTE), 12), lines: 1, line: "Ex", ch: 2 });
  assert.ok(source && live && source.kind === "cell" && live.kind === "cell");
  assert.deepEqual([live.section, live.column, live.typed], [source.section, source.column, source.typed]);
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
    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 0 });
});

test("a failing line is a row of the table widget drawn from its first line", () => {
  assert.deepEqual(tableRowOf(12, 12, 4), { kind: "header" });
  assert.deepEqual(tableRowOf(13, 12, 4), { kind: "header" });   // the separator has no row of its own
  assert.deepEqual(tableRowOf(14, 12, 4), { kind: "body", index: 0 });
  assert.deepEqual(tableRowOf(15, 12, 4), { kind: "body", index: 1 });
  assert.equal(tableRowOf(16, 12, 4), null);
  assert.equal(tableRowOf(11, 12, 4), null);
});
