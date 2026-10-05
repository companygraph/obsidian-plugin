// Found by this suite on its first run: the references pane, opened by its command while an
// entity's note is in front, said "Put the cursor in an entity's note." until another note came
// forward. Opening the pane makes it the active view, and the refresh that follows stood down
// whenever the pane was the active view, which is there to keep a redraw from swallowing a press
// inside the pane and was never meant for the pane's own opening.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the references pane", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("opened by its command with an entity's note in front, lists that note's references", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:open-references"));
    const titles = await ui.waitFor("the pane to list the note's references", () => {
      const pane = app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined;
      const found = Array.from(pane?.querySelectorAll<HTMLElement>(".companygraph-refs-title") ?? []).map((el) => el.innerText);
      return found.length ? found : null;
    }, [], 5000);
    assert.equal(titles.length, 2);
    assert.match(titles[0], /^Referred to by/i);
    assert.match(titles[1], /^Refers to/i);
  });

  // A phase whose If not met leads back to itself names itself; the pane lists it under Refers to
  // as this page, and its row opens the line the name is written on.
  test("a phase that leads back to itself is listed under Refers to as this page, and opens its line", async () => {
    const { ui } = session;
    const phase = "model/processes/delivery/phases/implement.md";
    await openNote(ui, phase);
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:open-references"));
    const self = await ui.waitFor("the pane to list this page under Refers to", () => {
      const pane = app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined;
      const file = Array.from(pane?.querySelectorAll<HTMLElement>(".companygraph-file") ?? [])
        .find((f) => f.querySelector(".companygraph-file-name")?.textContent === "this page");
      const row = file?.querySelector<HTMLElement>("li");
      return row ? { line: row.querySelector(".companygraph-line")?.textContent, text: row.innerText } : null;
    }, [], 5000) as { line: string; text: string };
    assert.equal(self.line, "79");
    assert.match(self.text, /Implement/);
    assert.match(self.text, /If not met · Leads to/);
    await ui.evaluate(() => {
      const pane = app.workspace.getLeavesOfType("companygraph-references")[0].view.contentEl as HTMLElement;
      const file = Array.from(pane.querySelectorAll<HTMLElement>(".companygraph-file"))
        .find((f) => f.querySelector(".companygraph-file-name")?.textContent === "this page")!;
      file.querySelector<HTMLElement>("li")!.click();
    });
    // Live Preview draws the table, so the row opens the cell the name stands in, as every row of
    // the pane opens a table's name.
    const at = await ui.waitFor("the cell the name is written in to be opened", () => {
      // The cell's own editor holds the focus, beside the text the widget drew, so the cell reads
      // its name twice.
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view as { editMode?: { tableCell?: unknown } } | undefined;
      const cell = (document.activeElement as HTMLElement | null)?.closest(".cm-table-widget td");
      return view?.editMode?.tableCell && cell?.textContent?.startsWith("Implement") ? app.workspace.getActiveFile()?.path ?? null : null;
    }, [], 5000);
    assert.equal(at, phase);
  });
});
