// Spec §1, the third defect: a name in a cell being edited keeps its mark and its path; one
// typed that names nothing reads as unresolved; one that names another entity resolves to it.
// Guards against release 0.5.1, where every cell being edited read as unresolved.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote, tablesOf } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("a name in a cell being edited", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.restore([PROFILE]).catch(() => {}); await session?.stop(); });

  test("keeps its mark, reads as unresolved when it names nothing, and resolves anew when it names another", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    const text = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    const skills = tablesOf(text).find((t) => t.header.join("|") === "Skill|Level")!;
    const levels = text.split("\n").slice(skills.first + 2, skills.last + 1).map((line) => line.split("|")[2].trim());
    const other = levels.find((level) => level !== levels[0])!;

    // The first body row's Level cell, clicked as a person clicks it.
    await ui.click(() => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[1]?.children[1]);
    await ui.waitFor("the Level cell to be open", focusedCell);
    // What marks a cell runs with the plugin's repaint; Check now asks for one, as a person can.
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:check-now"));
    const resting = await ui.waitFor("the cell being edited to carry its name's path", () => {
      const td = document.activeElement?.closest?.(".cm-table-widget td");
      return td?.getAttribute("data-companygraph-path") ? { path: td.getAttribute("data-companygraph-path"), unresolved: td.classList.contains("is-unresolved") } : null;
    });
    assert.equal(resting.unresolved, false);
    assert.match(resting.path!, /proficiency-levels\//);

    const retype = async (word: string) => {
      await ui.press("a", { meta: true });
      await ui.type(word);
    };
    await retype("Nonesuch");
    await ui.waitFor("a name that names nothing to read as unresolved", () =>
      document.activeElement?.closest?.(".cm-table-widget td")?.classList.contains("is-unresolved"));
    await retype(other);
    const renamed = await ui.waitFor("the other level's name to resolve", (first: string) => {
      const at = document.activeElement?.closest?.(".cm-table-widget td")?.getAttribute("data-companygraph-path");
      return at && !document.activeElement!.closest(".cm-table-widget td")!.classList.contains("is-unresolved") && at !== first ? at : null;
    }, [resting.path]);
    assert.match(renamed, /proficiency-levels\//);
  });
});
