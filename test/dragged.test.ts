import test from "node:test";
import assert from "node:assert/strict";
import { draggedOver } from "../src/dragged.ts";

// A stand-in for the two nodes the guard asks about: does this entry hold the selection's ends?
const node = (children: unknown[] = []): Node => ({ contains: (other: unknown) => children.includes(other) }) as unknown as Node;

test("a selection inside the entry is a drag over it, and none anywhere else is", () => {
  const inside = {} as Node;
  const entry = node([inside]);
  assert.equal(draggedOver(entry, { isCollapsed: false, anchorNode: inside, focusNode: inside }), true);
  assert.equal(draggedOver(entry, { isCollapsed: false, anchorNode: null, focusNode: inside }), true);
  // The selection the reader left in the note they came from, or in another pane.
  assert.equal(draggedOver(entry, { isCollapsed: false, anchorNode: {} as Node, focusNode: {} as Node }), false);
  // A cursor with nothing selected, and no selection at all.
  assert.equal(draggedOver(entry, { isCollapsed: true, anchorNode: inside, focusNode: inside }), false);
  assert.equal(draggedOver(entry, null), false);
});
