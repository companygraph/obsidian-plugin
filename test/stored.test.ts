import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, forgotPanes, settingsOf } from "../src/stored.ts";

test("a vault with no stored settings gets the defaults, and its own list of panes", () => {
  const settings = settingsOf(null);
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  // Its own array: the defaults are one object, and the list is pushed into.
  settings.suppressedPanes.push("backlink");
  assert.deepEqual(DEFAULT_SETTINGS.suppressedPanes, []);
});

test("what is stored is read, and each key held to its type", () => {
  assert.deepEqual(settingsOf({ replaceObsidianPanes: false, referencesInDocument: true, suppressedPanes: ["backlink", "tag-pane"] }), {
    replaceObsidianPanes: false,
    referencesInDocument: true,
    suppressedPanes: ["backlink", "tag-pane"],
  });
  // A key of the wrong type means nothing this plugin can act on, so the default stands.
  assert.equal(settingsOf({ replaceObsidianPanes: "yes" }).replaceObsidianPanes, true);
  assert.deepEqual(settingsOf({ suppressedPanes: "backlink" }).suppressedPanes, []);
  assert.deepEqual(settingsOf({ suppressedPanes: ["backlink", 7, null] }).suppressedPanes, ["backlink"]);
});

test("a key no release declares is dropped rather than carried forward", () => {
  const settings = settingsOf({ replaceObsidianPanes: true, agentCommand: "claude", agentSkill: "companygraph-validate" });
  assert.deepEqual(Object.keys(settings).sort(), ["referencesInDocument", "replaceObsidianPanes", "suppressedPanes"]);
});

test("only a vault written before the panes were remembered is repaired", () => {
  // Written by 0.4.0 or earlier: settings are there, the list is not.
  assert.equal(forgotPanes({ replaceObsidianPanes: true, referencesInDocument: false }), true);
  // Written by this release, with nothing switched off: the empty list is a record, not a gap.
  assert.equal(forgotPanes({ replaceObsidianPanes: true, suppressedPanes: [] }), false);
  assert.equal(forgotPanes({ suppressedPanes: ["backlink"] }), false);
  // A first run: a pane that is off there was off before this plugin ever ran.
  assert.equal(forgotPanes(null), false);
  assert.equal(forgotPanes(undefined), false);
});
