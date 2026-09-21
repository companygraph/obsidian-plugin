// Spec §1, the fourth defect: Cmd+S in a cell of a long table leaves the editor and the file in
// the family's Markdown form, the same cell open, and the file differing from before by the
// typed line alone. Guards against release 0.5.1, which left the table in Obsidian's padding,
// saved it so, and moved the focus to the table's last row.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote, paddedLines, tablesOf } from "./notes.ts";
import { clearNotices, command, entityOf, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the Markdown form, saved from a cell", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.restore([PROFILE]).catch(() => {}); await session?.stop(); });

  test("holds under a cell in the middle of the note's longest table", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    assert.equal(paddedLines(before), 0, "the fixture is in the form");
    const longest = tablesOf(before).sort((a, b) => (b.last - b.first) - (a.last - a.first))[0];
    // A row in the middle: the form replaces runs of lines whole, and a cursor in the middle of a
    // long run is the one carried furthest from its cell.
    const line = longest.first + Math.floor((longest.last - longest.first) / 2);
    const row = line - longest.first - 1;
    // The last column, not the first. Tried on release 0.5.1: from a cell of the first column the
    // defect does not show, from a later one it does, and a test that passes on the release it
    // guards against guards nothing.
    const col = longest.header.length - 1;

    await ui.evaluate((at: number) => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      editor.scrollIntoView({ from: { line: at, ch: 0 }, to: { line: at, ch: 0 } }, true);
    }, [line]);
    await ui.click((first: number, at: number, column: number) => {
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
      const cm = view.editor.cm;
      const widget = Array.from(view.containerEl.querySelectorAll(".cm-table-widget") as NodeListOf<HTMLElement>)
        .find((el) => { try { return cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1 === first; } catch { return false; } });
      return widget?.querySelectorAll("tr")[at]?.children[column];
    }, [longest.first, row, col]);
    const opened = await ui.waitFor("the cell to be open", focusedCell);
    assert.deepEqual([opened.row, opened.col], [row, col]);

    await ui.press("End");
    await ui.type("x");
    await ui.waitFor("Obsidian to have padded the table under the edit", () =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)));

    await ui.press("s", { mod: true });
    const formed = (wantRow: number, wantCol: number) => {
      const text = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string;
      const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
      const tr = td?.closest("tr");
      const inPlace = td && tr && td.cellIndex === wantCol && Array.from(tr.closest("table")!.rows).indexOf(tr) === wantRow;
      return !text.split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)) && Boolean(inPlace);
    };
    await ui.waitFor("the editor to be in the form again with the same cell open", formed, [row, col]);
    await ui.never("the table to be padded again, or the focus to leave the cell", (wantRow: number, wantCol: number) => {
      const text = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string;
      const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
      const tr = td?.closest("tr");
      const inPlace = td && tr && td.cellIndex === wantCol && Array.from(tr.closest("table")!.rows).indexOf(tr) === wantRow;
      return text.split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)) || !inPlace;
    }, [row, col], 2000);

    const after = await ui.waitFor("the file to hold the edit", async (at: string, was: string) => {
      const now = (await app.vault.adapter.read(at)) as string;
      return now !== was ? now : null;
    }, [PROFILE, before]);
    assert.equal(paddedLines(after), 0, "the file is in the form");
    const was = before.split("\n");
    const now = after.split("\n");
    assert.equal(now.length, was.length);
    assert.deepEqual(now.map((l, i) => (l === was[i] ? null : i)).filter((i) => i !== null), [line]);
    assert.ok(now[line].includes("x"));
  });

  test("Write this note in the form says so of a note already in it, and writes one that is not", async () => {
    const { ui } = session;
    await session.restore([PROFILE]);
    await openNote(ui, PROFILE);
    await ui.evaluate(() => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.focus());
    await clearNotices(ui);
    await command(ui, "write-form");
    await waitForNotice(ui, "already in the family's Markdown form");

    // A table padded the way an editor pads one, put there under the editor.
    const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    const skills = tablesOf(before).find((t) => t.header.join("|") === "Skill|Level")!;
    const lines = before.split("\n");
    lines[skills.first + 2] = lines[skills.first + 2].replace(/ \|$/, "      |");
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text), [PROFILE, lines.join("\n")]);
    await ui.waitFor("the editor to hold the padded row", () =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)));
    await command(ui, "write-form");
    await ui.waitFor("the editor to be in the form again", (text: string) => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() === text, [before]);
  });

  test("a note left with a table Obsidian padded is written back into the form", async () => {
    const { ui } = session;
    await session.restore([PROFILE]);
    await openNote(ui, PROFILE);
    const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    await ui.click(() => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[2]?.children[1]);
    await ui.waitFor("the cell to be open", focusedCell);
    await ui.press("End");
    await ui.type("x");
    await ui.waitFor("Obsidian to have padded the table under the edit", () =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)));
    const other = await entityOf(ui, "skill");
    await openNote(ui, other);
    const left = await ui.waitFor("the note that was left to hold the edit, in the form", async (at: string, was: string) => {
      const now = (await app.vault.adapter.read(at)) as string;
      return now !== was && !now.split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)) ? now : null;
    }, [PROFILE, before]);
    assert.equal(paddedLines(left), 0);
    assert.equal(left.split("\n").filter((l, i) => l !== before.split("\n")[i]).length, 1, "the typed line and no other");
  });
});
