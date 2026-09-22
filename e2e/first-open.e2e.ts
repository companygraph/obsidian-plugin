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

// The plugin's three panes on the right, as the tooling writes them into a vault it makes, each
// leaf as Obsidian keeps one, before Obsidian has ever run there; the tooling's Outline, Search
// and Bookmarks beside them are left out, since none of them is the plugin's to draw.
const leaf = (id: string, type: string, icon: string, title: string) => ({ id, type: "leaf", state: { type, state: {}, icon, title } });
const WORKSPACE = JSON.stringify({
  main: { id: "1000000000000000", type: "split", direction: "vertical", children: [{ id: "1000000000000001", type: "tabs", children: [
    { id: "1000000000000002", type: "leaf", state: { type: "markdown", state: { file: "model/identity.md", mode: "source", source: false, backlinks: false }, icon: "lucide-file", title: "identity" } },
  ] }] },
  left: { id: "1000000000000003", type: "split", direction: "horizontal", width: 300, children: [{ id: "1000000000000004", type: "tabs", children: [
    leaf("1000000000000005", "file-explorer", "lucide-folder-closed", "Files"),
  ] }] },
  right: { id: "1000000000000006", type: "split", direction: "horizontal", width: 450, children: [{ id: "1000000000000007", type: "tabs", children: [
    leaf("1000000000000008", "companygraph-references", "links-going-out", "References"),
    leaf("1000000000000009", "companygraph-checks", "list-checks", "Meta-model compliance"),
    leaf("100000000000000a", "companygraph-brief", "notebook-pen", "CompanyGraph brief"),
  ] }] },
  active: "1000000000000002",
  lastOpenFiles: ["model/identity.md"],
});

describe("a vault whose layout came before its plugins", { skip }, () => {
  let session: Session;
  before(async () => { session = await start({ workspace: WORKSPACE }); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("the plugin's three tabs come up drawn by the plugin on the vault's first open, unclicked", async () => {
    const { ui } = session;
    // start() has clicked the trust dialog and seen the plugin read the vault; the tabs were
    // restored before that, and nothing here clicks one. Under E2E_OBSIDIAN_VERSION the vault is
    // trusted before Obsidian starts and this passes with or without the fix; the stand-in below
    // carries the defect there.
    const drawn = await ui.waitFor("the three tabs to be the plugin's own", tabs, [PANES, false], 4000);
    assert.deepEqual(drawn.map((tab) => tab.split(":")[0]), PANES);
  });
});

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
