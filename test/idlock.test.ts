import test from "node:test";
import assert from "node:assert/strict";
import { containerMark, heldAfter, holdsEdit, idOf, isCopyPress, lostId, lostInProperties, tells } from "../src/idlock.ts";

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
  for (const passed of ["set", "undo", "redo", "input.section", "delete.section", "input.form", "input.id", "input.type.compose"])
    assert.equal(holdsEdit(passed, false), false, passed);
  for (const held of [undefined, "input", "input.type", "input.paste", "delete.backward", "delete.cut", "move.line"])
    assert.equal(holdsEdit(held, false), true, String(held));
  // The widget writes through the editor as `set`, the event of a reload from disk: only the
  // knowledge that the widget is writing tells the two apart.
  assert.equal(holdsEdit("set", true), true);
});

test("a line ending in a carriage return is read as the line", () => {
  assert.equal(idOf(PAGE.replaceAll("\n", "\r\n")), ID);
  assert.equal(idOf(BLANK.replaceAll("\n", "\r\n")), "");
});

test("a trailing comment is YAML's and no part of the id", () => {
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, `id: ${ID} # set by New entity`)), ID);
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, `id: "${ID}"  # quoted`)), ID);
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, "id: # owed")), "");
  // A `#` with no space before it is part of the value, as YAML reads it.
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, "id: a#b")), "a#b");
});

test("a write of the Properties widget that drops or changes a held id is refused, whatever the view", () => {
  assert.equal(lostInProperties(ID, { source: "Local" }), true);
  assert.equal(lostInProperties(ID, { id: `${ID}x`, source: "Local" }), true);
  assert.equal(lostInProperties(ID, { id: null }), true);
  assert.equal(lostInProperties(ID, { id: "" }), true);
  assert.equal(lostInProperties(ID, null), true);
  assert.equal(lostInProperties(ID, { id: ID, source: "Elsewhere" }), false);
  assert.equal(lostInProperties(ID, { id: ` ${ID} ` }), false);
  // YAML reads a bare number as one. It is the same id only where it prints as the id is
  // written: the widget saves back what it parsed, so `0123` would go to disk as `123`.
  assert.equal(lostInProperties("123", { id: 123 }), false);
  assert.equal(lostInProperties("0123", { id: 123 }), true);
  assert.equal(lostInProperties("+42", { id: 42 }), true);
  assert.equal(lostInProperties("0x2A", { id: 42 }), true);
  assert.equal(lostInProperties("4.2e1", { id: 42 }), true);
  assert.equal(lostInProperties("0123", { id: 124 }), true);
  // Nothing held, nothing refused: a blank id may be filled and a page may gain one.
  assert.equal(lostInProperties("", { id: ID }), false);
  assert.equal(lostInProperties(null, {}), false);
});

test("the id held is the page's as the editor took it from the file, and moves only with the file", () => {
  const open = (held: string | null) => ({ held, before: held });
  // A reload from disk, or the widget's own write that passed, both arrive as `set`.
  assert.deepEqual(heldAfter(open(""), "set", PAGE), { held: ID, before: "" });
  assert.deepEqual(heldAfter(open(null), "set", PAGE), { held: ID, before: null });
  assert.deepEqual(heldAfter(open(ID), "set", NONE), { held: null, before: ID });
  // Typing does not move it: a blank id stays open while it is being written.
  assert.deepEqual(heldAfter(open(""), "input.type", PAGE), open(""));
  assert.deepEqual(heldAfter(open(null), undefined, PAGE), open(null));
  assert.deepEqual(heldAfter(open(ID), "undo", BLANK), open(ID));
  // A name that merely begins like `set` is not one.
  assert.deepEqual(heldAfter(open(""), "settle", PAGE), open(""));
});

test("undo after the widget filled a blank id opens it again, and redo holds it again", () => {
  const filled = heldAfter({ held: "", before: "" }, "set", PAGE);
  const undone = heldAfter(filled, "undo", BLANK);
  assert.deepEqual(undone, { held: "", before: ID });
  assert.equal(lostId(undone.held, BLANK.replace("id:", "id: typed")), null);
  assert.deepEqual(heldAfter(undone, "redo", PAGE), { held: ID, before: "" });
  // An undo that leaves some other value keeps what is held.
  assert.deepEqual(heldAfter(filled, "undo", PAGE.replace(ID, "other")), filled);
});

test("YAML's null is a blank id, so the page is not locked and the widget may fill it", () => {
  for (const nothing of ["~", "null", "Null", "NULL", "null # owed"])
    assert.equal(idOf(PAGE.replace(`id: ${ID}`, `id: ${nothing}`)), "", nothing);
  assert.equal(lostId(idOf(PAGE.replace(`id: ${ID}`, "id: ~")), PAGE), null);
  // Quoted, it is the string, as YAML reads it; and a word that only begins so is a value.
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, 'id: "null"')), "null");
  assert.equal(idOf(PAGE.replace(`id: ${ID}`, "id: nullish")), "nullish");
});

test("only the note's own editor marks its container, and another editor leaves it alone", () => {
  assert.equal(containerMark(true, true), "set");
  assert.equal(containerMark(false, true), "remove");
  // A canvas node's editor, or a table cell's, shares a container it does not own.
  assert.equal(containerMark(true, false), "leave");
  assert.equal(containerMark(false, false), "leave");
});

test("a press copies only with the primary button and only where it did not move", () => {
  assert.equal(isCopyPress({ button: 0, x: 10, y: 10 }, { button: 0, x: 10, y: 10 }), true);
  assert.equal(isCopyPress({ button: 0, x: 10, y: 10 }, { button: 0, x: 13, y: 12 }), true);
  assert.equal(isCopyPress({ button: 0, x: 10, y: 10 }, { button: 0, x: 30, y: 10 }), false);
  assert.equal(isCopyPress({ button: 2, x: 10, y: 10 }, { button: 2, x: 10, y: 10 }), false);
  assert.equal(isCopyPress({ button: 1, x: 10, y: 10 }, { button: 0, x: 10, y: 10 }), false);
  // A release with no press seen on the value copies nothing.
  assert.equal(isCopyPress(null, { button: 0, x: 10, y: 10 }), false);
});

test("a refusal says so once for a burst, and a refusal of another thing says so at once", () => {
  const HEADING = '"What it means" is the schema\'s heading and cannot be edited here.';
  const ID_REFUSED = '"id" is the entity\'s identity and cannot be edited here.';
  // Nothing said yet: the first refusal is told.
  assert.equal(tells(null, ID_REFUSED, 1000), true);
  // The same refusal again within two seconds is the same burst, seen once.
  assert.equal(tells({ message: ID_REFUSED, at: 1000 }, ID_REFUSED, 2999), false);
  assert.equal(tells({ message: ID_REFUSED, at: 1000 }, ID_REFUSED, 3001), true);
  // A heading held a moment before says nothing of the id: the id's refusal is told at once.
  assert.equal(tells({ message: HEADING, at: 1000 }, ID_REFUSED, 1100), true);
});

test("the plugin's own fresh id moves what is held to the new id, so the page is locked on it", () => {
  const NEW = "0199a0c4-8000-7c11-9a2f-3c5e8d1f2a41";
  const moved = heldAfter({ held: ID, before: ID }, "input.id", PAGE.replace(ID, NEW));
  assert.deepEqual(moved, { held: NEW, before: ID });
  assert.equal(lostId(moved.held, PAGE.replace(ID, NEW)), null);
  assert.equal(lostId(moved.held, PAGE), NEW);
  // As the pass list reads an event, a name under `input.id` is that event too.
  assert.deepEqual(heldAfter({ held: ID, before: ID }, "input.id.fresh", PAGE.replace(ID, NEW)), moved);
});
