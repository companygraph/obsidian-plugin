// Found by the owner in a vault the tooling had just made: the plugin's own tabs, put in the
// layout before the vault's plugins were ever switched on, came back as Obsidian's ghost, icon
// and label alike, until each was clicked. A view type registered after its leaves were restored
// stays deferred; nothing loads it but a click. The same happens whenever the plugin is switched
// on after its tabs exist, which is how it is reproduced here without a first open.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const PANES = ["companygraph-references", "companygraph-checks", "companygraph-brief"];
// Every tab of the plugin's, as its type and the icon it is drawn with, where all are there and
// all are or none is a ghost, as asked; null otherwise, since a condition is read for its truth.
// Runs in the page, so it takes everything it needs as arguments.
const tabs = (types: string[], ghosts: boolean) => {
  const found = types.flatMap((type) => (app.workspace.getLeavesOfType(type) as { view: { getIcon(): string } }[]).map((leaf) => `${type}:${leaf.view.getIcon()}`));
  return found.length === types.length && found.every((tab) => tab.includes("ghost") === ghosts) ? found : null;
};

describe("the plugin's tabs when the plugin comes after them", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("tabs restored before the plugin was switched on show their own icons, not a ghost's", async () => {
    const { ui } = session;
    await ui.evaluate(async (types: string[]) => {
      for (const type of types) await app.workspace.getRightLeaf(false).setViewState({ type });
    }, [PANES]);
    await ui.waitFor("the three tabs to be there, drawn by the plugin", tabs, [PANES, false]);
    // Off, and the tabs are left as ghosts, which is how a fresh vault restores them.
    await ui.evaluate(() => app.plugins.disablePlugin("companygraph"));
    await ui.waitFor("the three tabs to be ghosts", tabs, [PANES, true]);
    // On again: the leaves exist before the views are registered, as on a first open.
    await ui.evaluate(() => app.plugins.enablePlugin("companygraph"));
    const back = await ui.waitFor("the three tabs to be drawn by the plugin again, unclicked", tabs, [PANES, false], 4000);
    assert.deepEqual(back.map((tab) => tab.split(":")[0]), PANES);
  });
});
