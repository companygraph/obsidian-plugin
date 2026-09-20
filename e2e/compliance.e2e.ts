// The compliance pane, the status bar and the marks a failure puts on the screen: a clean
// instance says so; a failure made in a cell and one made in the frontmatter are each listed,
// tinted where they stand, and opened from the pane where they are, the cell its message names
// and the Properties row of the field.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote, tablesOf } from "./notes.ts";
import { clearNotices, command, entityOf, onDisk, waitForChecks, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the compliance pane and what a failure marks", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("a clean instance says it complies, in the pane and in the status bar, and the report can be copied", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to have run clean", "none");
    await command(ui, "open-checks");
    const said = await ui.waitFor("the pane to say the instance complies", () => {
      const text = (app.workspace.getLeavesOfType("companygraph-checks")[0]?.view.contentEl as HTMLElement | undefined)?.innerText ?? "";
      return /complies with the meta-model/i.test(text) ? text : null;
    });
    assert.match(said, /meta-model \d/);
    const bar = await ui.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".status-bar-item")).map((el) => el.innerText).find((t) => t.startsWith("CompanyGraph")) ?? "");
    assert.equal(bar, "CompanyGraph: complies");
    await clearNotices(ui);
    await ui.click(".companygraph-copy");
    await waitForNotice(ui, "report copied");
  });

  test("a failure in a cell is listed, tints its row and says why, and opens the cell its message names", async () => {
    const { ui } = session;
    const before = (await onDisk(ui, PROFILE))!;
    const skills = tablesOf(before).find((t) => t.header.join("|") === "Skill|Level")!;
    const line = skills.first + 3;
    const cells = before.split("\n")[line].split("|");
    await openNote(ui, PROFILE);
    await ui.evaluate(async (at: string, n: number, was: string) => {
      const file = app.vault.getAbstractFileByPath(at);
      const lines = ((await app.vault.read(file)) as string).split("\n");
      lines[n] = lines[n].replace(`| ${was} |`, "| Nonesuch |");
      await app.vault.modify(file, lines.join("\n"));
    }, [PROFILE, line, cells[2].trim()]);
    const found = await waitForChecks(ui, "the checks to find the level that names nothing", "some");
    assert.equal(found.failures, 1);

    const listed = await ui.waitFor("the pane to list the failure under its file", () => {
      const pane = app.workspace.getLeavesOfType("companygraph-checks")[0]?.view.contentEl as HTMLElement | undefined;
      const item = pane?.querySelector<HTMLElement>("li.companygraph-open");
      return item ? { line: item.querySelector(".companygraph-line")?.textContent, message: item.querySelector(".companygraph-message")?.textContent, file: pane!.querySelector(".companygraph-file-name")?.textContent } : null;
    });
    assert.equal(listed.line, String(line + 1));
    assert.match(listed.message!, /Nonesuch/);
    assert.match(listed.file!, /^robert-blust/);
    assert.equal(await ui.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".status-bar-item")).map((el) => el.innerText).find((t) => t.startsWith("CompanyGraph"))), "CompanyGraph: 1 failure");

    const row = await ui.waitFor("the failing row to be tinted and to say why", (at: number) => {
      const tr = document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[at] as HTMLElement | undefined;
      return tr?.classList.contains("companygraph-mark") ? { says: tr.getAttribute("aria-label"), fill: getComputedStyle(tr).backgroundColor } : null;
    }, [line - skills.first - 1]);
    assert.match(row.says!, /Nonesuch/);
    assert.notEqual(row.fill, "rgba(0, 0, 0, 0)");

    // Away, and back by the pane: the failure's message names the Level column, and that cell opens.
    await openNote(ui, await entityOf(ui, "skill"));
    await ui.click("li.companygraph-open");
    const landed = await ui.waitFor("the failing cell to be open", focusedCell);
    const cell = await ui.waitFor("the focus to be in the Level cell of the failing row", (at: number) => {
      const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
      const tr = td?.closest("tr");
      return td && tr && td.cellIndex === 1 && Array.from(tr.closest("table")!.rows).indexOf(tr) === at ? td.innerText.trim() : null;
    }, [line - skills.first - 1]).catch(() => `landed in ${JSON.stringify(landed)}`);
    assert.match(cell, /^Nonesuch/);
    await session.restore([PROFILE]);
    await waitForChecks(ui, "the checks to be clean again", "none");
  });

  test("a failure in the frontmatter opens the note on the Properties row of its field", async () => {
    const { ui } = session;
    const note = await entityOf(ui, "experience");
    const was = (await onDisk(ui, note))!;
    await ui.evaluate(async (at: string) => {
      const file = app.vault.getAbstractFileByPath(at);
      await app.vault.modify(file, ((await app.vault.read(file)) as string).replace(/^source: .*$/m, "source: Nonesuch"));
    }, [note]);
    await waitForChecks(ui, "the checks to find the source that names nothing", "some");
    await openNote(ui, PROFILE);
    await ui.click("li.companygraph-open");
    const focus = await ui.waitFor("the source row of the Properties widget to hold the focus", (at: string) => {
      const key = document.activeElement?.closest?.(".metadata-property")?.getAttribute("data-property-key");
      return app.workspace.getActiveFile()?.path === at && key === "source" ? key : null;
    }, [note]);
    assert.equal(focus, "source");
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text), [note, was]);
    await waitForChecks(ui, "the checks to be clean again", "none");
  });
});
