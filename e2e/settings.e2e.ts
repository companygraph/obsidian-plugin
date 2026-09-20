// The settings tab and what its two switches do: Obsidian's own four panes go off in an
// instance, come back when the setting is turned off, and stay off across a reload; and the
// references under a note, by the setting's switch and by the command, open a mention as the
// pane does.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote } from "./notes.ts";
import { command, entityOf, frontPath } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const PANES = ["backlink", "outgoing-link", "properties", "tag-pane"];
// Null and not an empty list where none is on: a condition is read for its truth, and an empty
// list is true.
const panesOn = (ids: string[]) => {
  const on = ids.filter((id) => app.internalPlugins.getPluginById(id)?.enabled === true);
  return on.length ? on : null;
};
// Obsidian opens its settings in a window of their own, which the driver's mouse does not reach:
// its input goes to the main window. So this one switch is pressed through the element, the
// only place in the suite where a click is not a real one, and the seam to WebdriverIO, which
// can change windows, is where that ends. What the switch then does is held for real.
const flip = (name: string) => {
  const root = app.setting.activeTab?.containerEl as HTMLElement | undefined;
  const box = Array.from(root?.querySelectorAll<HTMLElement>(".setting-item") ?? []).find((s) => s.querySelector(".setting-item-name")?.textContent?.startsWith(name))?.querySelector<HTMLElement>(".checkbox-container");
  if (!box) return false;
  box.click();
  return true;
};

describe("the settings", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Obsidian's four panes are off in an instance, come back with the setting off, and stay off across a reload", async () => {
    const { ui } = session;
    await ui.waitFor("the four panes to be switched off", (ids: string[]) => ids.every((id) => app.internalPlugins.getPluginById(id)?.enabled !== true), [PANES]);

    await ui.evaluate(() => { app.setting.open(); app.setting.openTabById("companygraph"); });
    await ui.waitFor("the plugin's settings tab to show its switch, and the switch to be flipped", flip, ["Replace Obsidian's"]);
    const back = await ui.waitFor("the four panes to be back", (ids: string[]) => {
      const on = ids.filter((id) => app.internalPlugins.getPluginById(id)?.enabled === true);
      return on.length === ids.length ? on : null;
    }, [PANES]);
    assert.deepEqual(back, PANES);
    assert.equal(await ui.evaluate(flip, ["Replace Obsidian's"]), true);
    await ui.waitFor("the four panes to be off again", (ids: string[]) => ids.every((id) => app.internalPlugins.getPluginById(id)?.enabled !== true), [PANES]);
    await ui.evaluate(() => app.setting.close());

    // Obsidian writes which of its own plugins are on a moment after one is switched, and a
    // reload that comes sooner reads the file as it was: the panes would be on as the window
    // loads, which is Obsidian keeping its word and not the plugin failing to keep them off.
    // When it writes is Obsidian's own business and not what is held here, and waiting on it was
    // seen to run out now and then, so Obsidian is asked to write now, and the file is then read.
    await ui.waitFor("Obsidian to have written that the four panes are off", async (ids: string[]) => {
      await app.internalPlugins.saveConfig?.();
      if (!(await app.vault.adapter.exists(".obsidian/core-plugins.json"))) return false;
      const saved = JSON.parse((await app.vault.adapter.read(".obsidian/core-plugins.json")) as string);
      return ids.every((id) => saved[id] === false);
    }, [PANES]);
    await session.reload();
    // Watched, not only read once: a reload once switched them on and left their tabs behind.
    await ui.never("one of Obsidian's four panes to come back after the reload", panesOn, [PANES], 3000);
    assert.equal(await ui.evaluate(panesOn, [PANES]), null);
  });

  test("References in document draws the two lists under the note, and a mention there opens where the pane's would", async () => {
    const { ui } = session;
    const target = await entityOf(ui, "experience");
    await openNote(ui, target);
    assert.equal(await ui.evaluate(() => Boolean(document.querySelector(".companygraph-inline-refs"))), false, "off until asked for");
    await command(ui, "toggle-inline-references");
    const titles = await ui.waitFor("the lists to be drawn under the note", () => {
      const found = Array.from(document.querySelectorAll<HTMLElement>(".companygraph-inline-refs .companygraph-refs-title")).map((el) => el.textContent ?? "");
      return found.length === 2 ? found : null;
    });
    assert.match(titles[0], /^Referred to by/);
    await ui.click(".companygraph-inline-refs li.companygraph-open");
    await ui.waitFor("the mention's note to be in front", (from: string) => {
      const at = app.workspace.getActiveFile()?.path as string | undefined;
      return at && at !== from ? at : null;
    }, [target]);
    assert.notEqual(await frontPath(ui), target);

    await openNote(ui, target);
    await command(ui, "toggle-inline-references");
    await ui.waitFor("the lists to be gone again", () => !document.querySelector(".companygraph-inline-refs"));
  });

  test("a name the note itself writes, in the references pane, opens the entity it names", async () => {
    const { ui } = session;
    await command(ui, "open-references");
    await openNote(ui, PROFILE);
    const names = await ui.waitFor("the pane to list what the profile refers to", () => {
      const pane = app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined;
      const blocks = Array.from(pane?.children ?? []) as HTMLElement[];
      const out = blocks.find((b) => b.querySelector(".companygraph-refs-title")?.textContent?.startsWith("Refers to"));
      const file = out?.querySelector<HTMLElement>(".companygraph-file-name span")?.textContent;
      return file ?? null;
    });
    await ui.click(() => {
      const pane = app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined;
      const out = (Array.from(pane?.children ?? []) as HTMLElement[]).find((b) => b.querySelector(".companygraph-refs-title")?.textContent?.startsWith("Refers to"));
      return out?.querySelector("li.companygraph-open");
    });
    const at = await ui.waitFor("the named entity to be in front", (from: string) => {
      const path = app.workspace.getActiveFile()?.path as string | undefined;
      return path && path !== from ? path : null;
    }, [PROFILE]);
    assert.ok(at.endsWith(`/${names}.md`), `${at} is the file the row named, ${names}`);
  });
});
