import test from "node:test";
import assert from "node:assert/strict";
import { heldAfter, holdsEdit, idOf, lostId } from "../src/idlock.ts";

// The id lock (spec §8): since core 0.49.0 a page carries an `id` (R18), set once and never
// changed. What is compared is the id the lock holds and the id the page carries after an edit.
const ID = "0199a0c4-7b3e-7c11-9a2f-3c5e8d1f2a40";
const PAGE = ["---", `id: ${ID}`, "source: Local", "---", "", "# Reviewer", "", "> Reads the work.", ""].join("\n");
const BLANK = PAGE.replace(`id: ${ID}`, "id:");
const NONE = PAGE.replace(`id: ${ID}\n`, "");

test("the id is read from the frontmatter: its value, blank, or none at all", () => {
  assert.equal(idOf(PAGE), ID);
  assert.equal(idOf(BLANK), "");
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, "id:   ")), "");
  assert.equal(idOf(NONE), null);
  // One pair of quotes around the value is YAML's and no part of the id.
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, `id: "${ID}"`)), ID);
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, `id: '${ID}'`)), ID);
  // An `id:` in the body, or indented under another key, is not the page's id.
  assert.equal(idOf(`${NONE}\nid: ${ID}\n`), null);
  assert.equal(idOf(NONE.replace("source: Local", `source:\n  id: ${ID}`)), null);
  // A page whose frontmatter has not closed has none yet.
  assert.equal(idOf(`---\nid: ${ID}\n# Reviewer\n`), null);
});

test("an edit that changes the id's value is held, and names the id it held", () => {
  assert.equal(lostId(ID, PAGE.replace(ID, `${ID}x`)), ID);
  assert.equal(lostId(ID, PAGE.replace(ID, ID.slice(1))), ID);
  assert.equal(lostId(ID, PAGE.replace(ID, "0199a0c4-0000-7c11-9a2f-3c5e8d1f2a40")), ID);
});

test("an edit that removes the value, or the line, is held", () => {
  assert.equal(lostId(ID, BLANK), ID);
  assert.equal(lostId(ID, NONE), ID);
  // Renaming the key loses the id as surely as deleting it.
  assert.equal(lostId(ID, PAGE.replace(`id: ${ID}`, `ident: ${ID}`)), ID);
});

test("a blank id may be filled, and a page without one may gain one", () => {
  assert.equal(lostId("", PAGE), null);
  assert.equal(lostId(null, PAGE), null);
  assert.equal(lostId(null, BLANK), null);
});

test("an edit anywhere else passes, as does writing the same id in quotes", () => {
  assert.equal(lostId(ID, PAGE.replace("source: Local", "source: Elsewhere")), null);
  assert.equal(lostId(ID, PAGE.replace("# Reviewer", "# Critic")), null);
  assert.equal(lostId(ID, PAGE.replace("---\nid:", "---\ntags:\nid:")), null);
  assert.equal(lostId(ID, PAGE.replace(`id: ${ID}`, `id: "${ID}"`)), null);
  assert.equal(lostId(ID, `${PAGE}More.\n`), null);
});

test("the edits that pass the heading lock pass this one, and the Properties widget's own write is held", () => {
  for (const passed of ["set", "undo", "redo", "input.section", "delete.section", "input.form", "input.type.compose"])
    assert.equal(holdsEdit(passed, false), false, passed);
  for (const held of [undefined, "input", "input.type", "input.paste", "delete.backward", "delete.cut", "move.line"])
    assert.equal(holdsEdit(held, false), true, String(held));
  // The widget writes through the editor as `set`, the event of a reload from disk: only the
  // knowledge that the widget is writing tells the two apart.
  assert.equal(holdsEdit("set", true), true);
});

test("the id held is the page's as the editor took it from the file, and moves only with the file", () => {
  // A reload from disk, or the widget's own write that passed, both arrive as `set`.
  assert.equal(heldAfter("", "set", PAGE), ID);
  assert.equal(heldAfter(null, "set", PAGE), ID);
  assert.equal(heldAfter(ID, "set", NONE), null);
  // Typing does not move it: a blank id stays open while it is being written.
  assert.equal(heldAfter("", "input.type", PAGE), "");
  assert.equal(heldAfter(null, undefined, PAGE), null);
  assert.equal(heldAfter(ID, "undo", BLANK), ID);
  // A name that merely begins like `set` is not one.
  assert.equal(heldAfter("", "settle", PAGE), "");
});
