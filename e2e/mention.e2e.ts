// Spec §1, the first defect: a mention clicked in the references pane opens the cell that holds
// its name — its own row and its own column, in sight — and the note is left as it was. Guards
// against release 0.5.1, which opened the row's first cell, could miss a long table altogether,
// and let Obsidian move the focus to the table's last row and write the table out again.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, editorText, focusedCell, mentionsOf, openNote, tablesOf } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("a mention in the references pane", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("opens the cell that holds its name, in its own row, and leaves the note alone", async () => {
    const { ui } = session;
    // An entity the profile names in a column that is not the first, in more rows than one, so a
    // wrong column and a wrong row both show. Found in the fixture, not written here.
    const candidates = await ui.evaluate((profile: string) => {
      const plugin = app.plugins.plugins.companygraph;
      const out: { target: string; rows: number }[] = [];
      for (const at of plugin.files.keys() as Iterable<string>) {
        if (!at.startsWith("model/") || !at.endsWith(".md")) continue;
        const rows = (plugin.referencesAt(at)?.in ?? []).flatMap((g: { mentions: { path: string; declared: string }[] }) => g.mentions)
          .filter((m: { path: string; declared: string }) => m.path === profile && m.declared.endsWith("· Experience")).length;
        if (rows > 1) out.push({ target: at, rows });
      }
      return out.sort((a, b) => b.rows - a.rows);
    }, [PROFILE]);
    assert.ok(candidates.length > 0, "the fixture names an experience in more than one row of the profile's Evidence table");
    const target = candidates[0].target;

    const mentions = (await mentionsOf(ui, target)).filter((m) => m.path === PROFILE && m.declared.endsWith("· Experience"));
    // The pane is open before the note comes forward, as it is for someone who keeps it open; a
    // pane opened over a note already in front is references-pane.e2e.ts's own question.
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:open-references"));
    for (const mention of [mentions[0], mentions[mentions.length - 1]]) {
      await openNote(ui, target);
      const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
      const table = tablesOf(before).find((t) => t.first <= mention.line && mention.line <= t.last)!;
      const want = { row: mention.line - table.first - 1, col: table.header.indexOf("Experience"), first: before.split("\n")[mention.line].split("|")[1].trim() };

      await ui.click((line: number) => {
        const pane = app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined;
        return Array.from(pane?.querySelectorAll<HTMLElement>("li.companygraph-open") ?? []).find((li) => li.querySelector(".companygraph-line")?.textContent === String(line));
      }, [mention.line + 1]);

      const cell = await ui.waitFor(`the cell of line ${mention.line + 1} to be open`, focusedCell);
      const landed = await ui.waitFor(`the focus to be in row ${want.row}, column ${want.col}`, (row: number, col: number) => {
        const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
        const tr = td?.closest("tr");
        return td && tr && td.cellIndex === col && Array.from(tr.closest("table")!.rows).indexOf(tr) === row;
      }, [want.row, want.col]).then(() => ui.evaluate(focusedCell)).catch(() => cell);
      assert.deepEqual({ row: landed!.row, col: landed!.col, text: landed!.text, first: landed!.rowTexts[0] },
        { row: want.row, col: want.col, text: mention.name, first: want.first });
      assert.ok(landed!.inSight, "the cell is in sight");

      // Longer than the rebuild's own delay and the repaint after it, which is when Obsidian
      // moved the focus and wrote the table out.
      await ui.never("the focus to leave the cell, or the note's text to change", (row: number, col: number, text: string) => {
        const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
        const tr = td?.closest("tr");
        const there = td && tr && td.cellIndex === col && Array.from(tr.closest("table")!.rows).indexOf(tr) === row;
        return !there || app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() !== text;
      }, [want.row, want.col, before], 1500);
      assert.equal(await ui.evaluate(editorText), before);
    }
  });
});
