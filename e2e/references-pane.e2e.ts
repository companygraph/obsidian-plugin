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
});
