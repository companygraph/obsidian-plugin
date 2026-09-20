import test from "node:test";
import assert from "node:assert/strict";
import { onRebuild, onRepair, onRestore } from "../src/panes.ts";

const PANES = ["backlink", "outgoing-link", "properties", "tag-pane"];
// A vault's pane switches, which a decision reads and the caller then writes back.
const vault = (on: string[]) => (id: string) => on.includes(id);

test("a rebuild switches off what is on and remembers it", () => {
  const d = onRebuild(PANES, true, vault(PANES), []);
  assert.deepEqual(d.disable, PANES);
  assert.deepEqual(d.enable, []);
  assert.deepEqual(d.remembered, PANES);
});

test("a pane the owner had off is left alone and never remembered, so it is never given back", () => {
  const d = onRebuild(PANES, true, vault(["backlink", "properties"]), []);
  assert.deepEqual(d.disable, ["backlink", "properties"]);
  assert.deepEqual(d.remembered, ["backlink", "properties"]);
  assert.deepEqual(onRestore(d.remembered).enable, ["backlink", "properties"]);
});

test("a stale entry does not stop a pane that is on again from going off", () => {
  // What an unfinished save on the last unload leaves behind.
  const d = onRebuild(PANES, true, vault(["backlink"]), ["backlink", "tag-pane"]);
  assert.deepEqual(d.disable, ["backlink"]);
  assert.deepEqual(d.remembered, ["backlink", "tag-pane"], "already there, not added twice");
});

// THE REGRESSION. On a reload the plugin is loaded before the vault has been read, so the first
// rebuild runs with standIn false because nothing is known yet, not because there is no instance.
// Restoring there switched all four panes back on, Obsidian rebuilt their leaves in the sidebar,
// and the next rebuild switched them off again leaving the tabs behind for the owner to close.
test("a rebuild that does not stand in switches nothing on, and keeps the list", () => {
  const d = onRebuild(PANES, false, vault([]), PANES);
  assert.deepEqual(d.enable, [], "a rebuild never switches a pane on");
  assert.deepEqual(d.disable, []);
  assert.deepEqual(d.remembered, PANES, "and it forgets nothing, so the next one can still give them back");
});

test("the panes stay off across a reload, and the list survives it", () => {
  // Load, stand in, all four go off and are remembered.
  let on = [...PANES];
  const first = onRebuild(PANES, true, vault(on), []);
  on = on.filter((id) => !first.disable.includes(id));
  assert.deepEqual(on, []);
  // Reload: the first rebuild knows nothing yet, the second does. Neither may switch one on.
  const checking = onRebuild(PANES, false, vault(on), first.remembered);
  assert.deepEqual(checking.enable, []);
  const settled = onRebuild(PANES, true, vault(on), checking.remembered);
  assert.deepEqual(settled.enable, []);
  assert.deepEqual(settled.disable, [], "they are already off; nothing to do");
  assert.deepEqual(settled.remembered, PANES, "still this plugin's to give back");
});

test("a restore gives back exactly what was remembered and then holds nothing", () => {
  const d = onRestore(PANES);
  assert.deepEqual(d.enable, PANES);
  assert.deepEqual(d.disable, []);
  assert.deepEqual(d.remembered, []);
  assert.deepEqual(onRestore([]).enable, [], "nothing remembered, nothing given back");
});

test("the repair adopts what is off and switches nothing", () => {
  const d = onRepair(PANES, vault([]), []);
  assert.deepEqual(d.remembered, PANES);
  assert.deepEqual([d.disable, d.enable], [[], []]);
  // A pane that is on was never this plugin's doing.
  assert.deepEqual(onRepair(PANES, vault(["tag-pane"]), []).remembered, ["backlink", "outgoing-link", "properties"]);
});

// Found by the suite under e2e/ in a fresh vault: a pane switched off left its tab behind as a
// ghost, labelled with its raw id, for every new user to close by hand. Obsidian's own switch
// closes a pane's tabs when a person turns it off; the plugin's did not.
test("a rebuild closes the tabs of what it switches off, and of what it holds off that still has one", () => {
  const tabs = (open: string[]) => (id: string) => open.includes(id);
  // Just switched off: its tab goes with it.
  assert.deepEqual(onRebuild(PANES, true, vault(PANES), [], tabs(PANES)).close, PANES);
  // Held off since an earlier release, tab still open: closed now. A pane with no tab is left alone.
  assert.deepEqual(onRebuild(PANES, true, vault([]), ["backlink", "tag-pane"], tabs(["backlink", "properties"])).close, ["backlink"]);
  // Off by the owner's own doing and never remembered: not this plugin's tab to close.
  assert.deepEqual(onRebuild(PANES, true, vault([]), [], tabs(PANES)).close, []);
  // Nothing known about the vault yet: nothing is closed, as nothing is switched.
  assert.deepEqual(onRebuild(PANES, false, vault(PANES), ["backlink"], tabs(PANES)).close, []);
});

test("a restore and a repair close nothing", () => {
  assert.deepEqual(onRestore(["backlink"]).close, []);
  assert.deepEqual(onRepair(PANES, vault([]), []).close, []);
});
