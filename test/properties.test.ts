import test from "node:test";
import assert from "node:assert/strict";
import { fieldOfLine, propertyRules } from "../src/properties.ts";

const FILE = [
  "---",                 // 0
  "source: Nowhere",     // 1
  "requires:",           // 2
  "  - Java Programming", // 3
  "  - Cobol",           // 4
  "",                    // 5
  "---",                 // 6
  "",                    // 7
  "# Writer",            // 8
  "source: not a field down here", // 9
];

test("a key's own line belongs to that field", () => {
  assert.equal(fieldOfLine(FILE, 1), "source");
  assert.equal(fieldOfLine(FILE, 2), "requires");
});

test("an entry of a block sequence belongs to the key above it, however far", () => {
  assert.equal(fieldOfLine(FILE, 3), "requires");
  assert.equal(fieldOfLine(FILE, 4), "requires");
});

test("the fences, a blank line and the body belong to no field", () => {
  for (const line of [0, 5, 6, 8, 9]) assert.equal(fieldOfLine(FILE, line), null);
});

test("a file with no frontmatter has no fields", () => {
  assert.equal(fieldOfLine(["source: Local"], 0), null);
});

test("one rule per field, scoped to one leaf, and none at all for no fields", () => {
  assert.equal(propertyRules("7", []), "");
  const css = propertyRules("7", ["source", "requires", "source"]);
  assert.equal(css.match(/data-property-key/g)!.length, 2);
  assert.ok(css.includes('[data-companygraph-leaf="7"] .metadata-property[data-property-key="source"]'));
  assert.ok(css.includes('[data-property-key="requires"]'));
});

test("a field name that is not a plain key writes no rule", () => {
  assert.equal(propertyRules("7", ['x"] , body { display:none } [y="']), "");
});
