// Found by this suite in a fresh vault: a pane the plugin switched off left its tab behind as a
// ghost, labelled with its raw id, for every new user to close by hand, and a pane given back
// stayed a ghost until the window was loaded again. Obsidian's own switch closes a pane's tabs
// when a person turns it off and puts them back when it is turned on; the plugin's did neither.
// A file of its own, because a session begins with a fresh vault and that is where it shows.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { command } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const TABS = ["backlink", "outgoing-link", "tag", "all-properties"];
// Every tab of the four, as its type and the icon it is drawn with; a ghost is a tab whose pane
// is off. Null where there is none, since a condition is read for its truth.
const tabs = (types: string[]) => {
  const found = types.flatMap((type) => (app.workspace.getLeavesOfType(type) as { view: { getIcon(): string } }[]).map((leaf) => `${type}:${leaf.view.getIcon()}`));
  return found.length ? found : null;
};
// Obsidian's settings are a window of their own; see settings.e2e.ts for why this one switch is
// pressed through its element.
const flip = (name: string) => {
  const root = app.setting.activeTab?.containerEl as HTMLElement | undefined;
  const box = Array.from(root?.querySelectorAll<HTMLElement>(".setting-item") ?? []).find((s) => s.querySelector(".setting-item-name")?.textContent?.startsWith(name))?.querySelector<HTMLElement>(".checkbox-container");
  if (!box) return false;
  box.click();
  return true;
};

describe("the tabs of Obsidian's own panes", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("a fresh vault is left with no ghost of a pane the plugin switched off", async () => {
    const { ui } = session;
    await ui.waitFor("the four panes to be switched off", () =>
      ["backlink", "outgoing-link", "properties", "tag-pane"].every((id) => app.internalPlugins.getPluginById(id)?.enabled !== true));
    await ui.waitFor("no tab of the four to be left", (types: string[]) => types.every((type) => app.workspace.getLeavesOfType(type).length === 0), [TABS]);
    // And none comes back as the plugin rebuilds: watched, since a rebuild runs again and again.
    await ui.never("a ghost tab to be there", tabs, [TABS], 2000);
  });

  test("a ghost an earlier release left open is closed the next time the plugin reads the vault", async () => {
    const { ui } = session;
    // As a vault that met an earlier release has it: the pane off and remembered, its tab still there.
    await ui.evaluate(async () => { await app.workspace.getRightLeaf(false).setViewState({ type: "backlink" }); });
    assert.deepEqual(await ui.waitFor("the ghost to be there", tabs, [["backlink"]]), ["backlink:lucide-ghost"]);
    await command(ui, "check-now");
    await ui.waitFor("the ghost to be closed", () => app.workspace.getLeavesOfType("backlink").length === 0);
  });

  test("a pane given back has a working tab at once, and loses it again with the setting on", async () => {
    const { ui } = session;
    await ui.evaluate(() => { app.setting.open(); app.setting.openTabById("companygraph"); });
    await ui.waitFor("the plugin's settings tab to show its switch, and the switch to be flipped", flip, ["Replace Obsidian's"]);
    const back = await ui.waitFor("each of the four panes to have a tab again", (types: string[]) => {
      const found = types.flatMap((type) => (app.workspace.getLeavesOfType(type) as { view: { getIcon(): string } }[]).map((leaf) => `${type}:${leaf.view.getIcon()}`));
      return found.length === types.length ? found : null;
    }, [TABS]);
    assert.deepEqual(back.filter((tab) => tab.includes("ghost")), [], "working tabs, not ghosts");

    assert.equal(await ui.evaluate(flip, ["Replace Obsidian's"]), true);
    await ui.waitFor("the tabs to be closed again with the panes", (types: string[]) => types.every((type) => app.workspace.getLeavesOfType(type).length === 0), [TABS]);
    await ui.evaluate(() => app.setting.close());
  });

  // Last, since it ends with the plugin off.
  test("the plugin switched off gives the four panes back, each with a working tab", async () => {
    const { ui } = session;
    await ui.waitFor("the four panes to be off while the plugin stands in for them", () =>
      ["backlink", "outgoing-link", "properties", "tag-pane"].every((id) => app.internalPlugins.getPluginById(id)?.enabled !== true));
    await ui.evaluate(() => app.plugins.disablePlugin("companygraph"));
    const back = await ui.waitFor("the four panes to be on again, each with a tab", (types: string[]) => {
      const on = ["backlink", "outgoing-link", "properties", "tag-pane"].every((id) => app.internalPlugins.getPluginById(id)?.enabled === true);
      const found = types.flatMap((type) => (app.workspace.getLeavesOfType(type) as { view: { getIcon(): string } }[]).map((leaf) => `${type}:${leaf.view.getIcon()}`));
      return on && found.length === types.length ? found : null;
    }, [TABS]);
    assert.deepEqual(back.filter((tab) => tab.includes("ghost")), []);
  });
});
