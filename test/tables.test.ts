import test from "node:test";
import assert from "node:assert/strict";
import { cellContextOf, sectionAbove, tableRowOf } from "../src/tables.ts";

const NOTE = [
  "---", "source: Local", "---", "",   // 0-3
  "# Mira", "",                        // 4-5
  "## Summary", "", "Prose.", "",      // 6-9
  "## Skills", "",                     // 10-11
  "| Skill | Level | Evidence |",     // 12
  "| --- | --- | --- |",              // 13
  "| Java | Expert | built it |",     // 14
  "| Go | Ex | x |",                  // 15
];

test("the section a line sits under is the nearest ## heading above it", () => {
  assert.equal(sectionAbove(NOTE, 12), "Skills");
  assert.equal(sectionAbove(NOTE, 8), "Summary");
  assert.equal(sectionAbove(NOTE, 4), null);
});

test("a body cell of a table in Live Preview is a cell context named by the header's text", () => {
  const header = ["Skill", " Level ", "Evidence"];
  assert.deepEqual(cellContextOf({ header, row: 2, col: 1, section: "Skills", line: "Ex", ch: 2 }),
    { kind: "cell", section: "Skills", column: "Level", typed: "Ex", start: 0 });
  assert.deepEqual(cellContextOf({ header, row: 1, col: 0, section: "Skills", line: "  Ja", ch: 4 }),
    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 2 });
});

test("the header row, a table under no section, a column with no header and text after the cursor give none", () => {
  const header = ["Skill", "Level"];
  assert.equal(cellContextOf({ header, row: 0, col: 0, section: "Skills", line: "Ski", ch: 3 }), null);
  assert.equal(cellContextOf({ header, row: 1, col: 0, section: null, line: "Ja", ch: 2 }), null);
  assert.equal(cellContextOf({ header, row: 1, col: 5, section: "Skills", line: "Ja", ch: 2 }), null);
  assert.equal(cellContextOf({ header, row: 1, col: 0, section: "Skills", line: "Java", ch: 2 }), null);
  assert.deepEqual(cellContextOf({ header, row: 1, col: 0, section: "Skills", line: "Ja  ", ch: 2 }),
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
