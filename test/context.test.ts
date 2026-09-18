import test from "node:test";
import assert from "node:assert/strict";
import { contextAt } from "../src/context.ts";

const FILE = [
  "---",            // 0
  "source: Lo",     // 1
  "roles:",         // 2
  "  - Rev",        // 3
  "nat",            // 4
  "---",            // 5
  "",               // 6
  "# Mira",         // 7
  "",               // 8
  "## Skills",      // 9
  "",               // 10
  "| Skill | Level | Evidence |", // 11
  "| --- | --- | --- |",          // 12
  "| Java | Exp",                 // 13
  "",               // 14
  "## Su",          // 15
  "source: not a field down here", // 16
];
const at = (line: number) => contextAt(FILE, line, FILE[line].length);

test("after a key's colon: the value of that field", () => {
  assert.deepEqual(at(1), { kind: "value", field: "source", typed: "Lo", start: 8 });
});

test("on an entry of a block sequence: the value of the key above", () => {
  assert.deepEqual(at(3), { kind: "value", field: "roles", typed: "Rev", start: 4 });
});

test("at the start of a frontmatter line: a key", () => {
  assert.deepEqual(at(4), { kind: "key", typed: "nat", start: 0 });
});

test("in a table row: the cell's column by the header's name, under its section", () => {
  assert.deepEqual(at(13), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9 });
});

test("the header and separator rows are not cells", () => {
  assert.equal(at(11), null);
  assert.equal(at(12), null);
});

test("on a heading line: a section", () => {
  assert.deepEqual(at(15), { kind: "heading", typed: "Su", start: 3 });
});

test("a line in the body that reads like a field is not one", () => {
  assert.equal(at(16), null);
});

test("the fences and a file with no frontmatter offer no key", () => {
  assert.equal(at(0), null);
  assert.equal(contextAt(["sou"], 0, 3), null);
});

test("a table with no valid separator row offers no cell, even on what looks like a data row", () => {
  const lines = [
    "## Skills",
    "",
    "| Skill | Level | Evidence |",
    "| Java | Exp | ok |",
    "| Cobol | Nov | eh",
  ];
  assert.equal(contextAt(lines, 4, lines[4].length), null);
});

test("a key with text still following the cursor on the line is not a key to complete", () => {
  const lines = ["---", "name: Foo", "---"];
  assert.equal(contextAt(lines, 1, 3), null);
});

test("a value with text still following the cursor on the line is not a value to complete", () => {
  const lines = ["---", "source: Local", "---"];
  assert.equal(contextAt(lines, 1, 10), null);
});

test("a heading with text still following the cursor on the line is not a heading to complete", () => {
  const lines = ["## Skills and more"];
  assert.equal(contextAt(lines, 0, 6), null);
});

test("a cell with text still following the cursor before the next pipe is not a cell to complete", () => {
  const lines = [
    "## Skills",
    "",
    "| Skill | Level | Evidence |",
    "| --- | --- | --- |",
    "| Java | Expert | built it |",
  ];
  assert.equal(contextAt(lines, 4, 12), null);
});

test("a cell with only a space before the next pipe is still offered", () => {
  const lines = [
    "## Skills",
    "",
    "| Skill | Level | Evidence |",
    "| --- | --- | --- |",
    "| Java | Exp | built it |",
  ];
  assert.deepEqual(contextAt(lines, 4, 12), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9 });
});

test("trailing whitespace only after the cursor still yields the context", () => {
  const lines = ["---", "nat  ", "---"];
  assert.deepEqual(contextAt(lines, 1, 3), { kind: "key", typed: "nat", start: 0 });
});
