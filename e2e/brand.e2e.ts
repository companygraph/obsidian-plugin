// The brand type as a person writes it in the vault: the one file the checks require, its section
// picker offering the section it lacks, and the header a table section is written with.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { openNote } from "./notes.ts";
import { command, pick, promptItems, waitForPrompt } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const BRAND = "model/brand.md";
// A callback handed to waitFor runs inside Obsidian's page, so each reads the editor for itself.

describe("the brand type", { skip }, () => {
  let session: Session;
  before(async () => {
    // A fixture from before the instance carried a brand would let the test below pass on nothing.
    assert.ok(fs.existsSync(path.join("test", "fixtures", "mental-model", BRAND)), "the fixture instance holds a brand");
    session = await start();
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Add a section on the brand offers the required table it lacks and writes it with its header row", async () => {
    const { ui } = session;
    await openNote(ui, BRAND);
    // Take `## Color` out through the vault, table and all, so the picker has something to offer;
    // the note goes back as the fixture had it at the end.
    await ui.evaluate(async (note: string) => {
      const file = app.vault.getFileByPath(note)!;
      const lines = (await app.vault.read(file)).split("\n");
      const from = lines.indexOf("## Color");
      const to = lines.findIndex((l: string, i: number) => i > from && l.startsWith("## "));
      await app.vault.modify(file, [...lines.slice(0, from), ...lines.slice(to)].join("\n"));
    }, [BRAND]);
    await ui.waitFor("the editor to show the note without its Color section", () => !(app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).includes("## Color") || null);
    await ui.evaluate(() => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.focus());
    await command(ui, "add-section");
    assert.equal(await waitForPrompt(ui), "A section this page may still take");
    assert.deepEqual(await promptItems(ui), ["Color (required)"]);
    await pick(ui, "Color");
    await ui.waitFor("the Color table's header to be written", () => (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).includes("## Color\n\n| Name | Means | Never |\n| --- | --- | --- |") || null);
    await session.restore([BRAND]);
  });
});
