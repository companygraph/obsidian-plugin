// Spec §1 and §6: the one cell being edited is drawn as a selection of one, in the dark theme
// and the light, and a cell of a selected range is left to Obsidian. What is held is that the
// style is there, not what color a theme makes it (spec §9). Guards against release 0.5.1,
// which drew nothing.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const cellAt = (row: number, col: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[row]?.children[col];

describe("the cell that holds the focus", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  for (const theme of ["theme-dark", "theme-light"]) {
    test(`carries a ring and a fill in ${theme}, and its neighbour neither`, async () => {
      const { ui } = session;
      await ui.evaluate((name: string) => { document.body.classList.remove("theme-dark", "theme-light"); document.body.classList.add(name); }, [theme]);
      await openNote(ui, PROFILE);
      await ui.click(cellAt, [2, 0]);
      const cell = await ui.waitFor("the focused cell to carry a ring", () => {
        const td = document.activeElement?.closest?.(".cm-table-widget td");
        return td && getComputedStyle(td).boxShadow !== "none" ? { shadow: getComputedStyle(td).boxShadow, fill: getComputedStyle(td).backgroundColor } : null;
      });
      assert.match(cell.shadow, /inset/);
      assert.notEqual(cell.fill, "rgba(0, 0, 0, 0)");
      const neighbour = await ui.evaluate(() => getComputedStyle(document.activeElement!.closest("tr")!.nextElementSibling!.children[0]).boxShadow);
      assert.equal(neighbour, "none");
    });
  }

  test("is not drawn on a cell of a selected range, which Obsidian draws itself", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await ui.click(cellAt, [2, 0]);
    await ui.waitFor("a cell to be open", focusedCell);
    await ui.click(cellAt, [4, 1], { shift: true });
    const selected = await ui.waitFor("a range of cells to be selected", () => {
      const cells = Array.from(document.querySelectorAll(".cm-table-widget td.is-selected"));
      return cells.length > 1 ? cells.map((td) => getComputedStyle(td).boxShadow) : null;
    });
    assert.deepEqual(new Set(selected), new Set(["none"]));
  });
});
