// A group's Direction, the organization pack's table from meta-model 0.92.0, as a person writes
// it in the editor: Add a section offers it and writes its header, its two cells offer the
// vault's profiles, and the bundled checks hold what the schema says, a human in Directed by.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { focusedCell, openNote, tablesOf } from "./notes.ts";
import { command, onDisk, pick, promptItems, waitForChecks, waitForPrompt } from "./ui.ts";

const skip = available("pack-instance") ? false : "Obsidian or the pack fixture is missing; set OBSIDIAN_BIN, and run npm test once to fetch the fixtures";
const GROUP = "model/groups/maintainers.md";
const offered = () => {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
  return items.length ? items : null;
};
const narrowedTo = (name: string) => {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
  return items.length === 1 && items[0] === name ? items : null;
};
// Each predicate runs inside Obsidian, so it reads the editor itself rather than through a helper.
const editorHas = (needle: string) => (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).includes(needle) || null;
const directionCell = (col: number) => {
  const table = Array.from(document.querySelectorAll(".cm-table-widget table")).find((t) => t.querySelector("tr")?.textContent?.includes("Directed by"));
  return table?.querySelectorAll("tr")[1]?.children[col] ?? null;
};

describe("a group's Direction in the editor", { skip }, () => {
  let session: Session;
  before(async () => { session = await start({ fixture: "pack-instance" }); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Add a section offers Direction on a group and writes its header row", async () => {
    const { ui } = session;
    await openNote(ui, GROUP);
    await ui.evaluate(() => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.focus());
    await command(ui, "add-section");
    assert.equal(await waitForPrompt(ui), "A section this page may still take");
    const items = await promptItems(ui);
    assert.ok(items.includes("Direction"), items.join(", "));
    await pick(ui, "Direction");
    await ui.waitFor("the Direction table's header to be written", editorHas, ["## Direction\n\n| Agent | Directed by |\n| --- | --- |"]);
    await waitForChecks(ui, "the checks to stay clean with an empty Direction", "none");
    await session.restore([GROUP]);
  });

  test("the Agent and Directed by cells offer the vault's profiles, and the row chosen is checked clean", async () => {
    const { ui } = session;
    const before = (await onDisk(ui, GROUP))!;
    await openNote(ui, GROUP);
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text),
      [GROUP, `${before.trimEnd()}\n\n## Direction\n\n| Agent | Directed by |\n| --- | --- |\n|  |  |\n`]);
    await ui.waitFor("the editor to show the Direction table", editorHas, ["## Direction"]);
    const profiles = await ui.evaluate(() => (app.plugins.plugins.companygraph.named as { type: string; name: string }[]).filter((n) => n.type === "profile").map((n) => n.name).sort());

    await ui.click(directionCell, [0]);
    await ui.waitFor("the empty Agent cell to be open", focusedCell);
    const agents = await ui.waitFor("the profiles to be offered in Agent", offered);
    assert.deepEqual([...agents].sort(), profiles);
    await ui.type("English");
    await ui.waitFor("the list to narrow to English Voice", narrowedTo, ["English Voice"]);
    await ui.press("Enter");

    await ui.click(directionCell, [1]);
    await ui.waitFor("the empty Directed by cell to be open", focusedCell);
    const directors = await ui.waitFor("the profiles to be offered in Directed by", offered);
    assert.deepEqual([...directors].sort(), profiles);
    await ui.type("Robert");
    await ui.waitFor("the list to narrow to Robert Blust", narrowedTo, ["Robert Blust"]);
    await ui.press("Enter");
    await ui.waitFor("the row to be written", () => (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").find((l) => l.includes("English Voice") && l.includes("Robert Blust")) ?? null);
    await waitForChecks(ui, "English Voice directed by Robert Blust to be checked clean", "none");
    await session.restore([GROUP]);
  });

  test("an agent as the director is refused by the bundled check, in the pane and on the row", async () => {
    const { ui } = session;
    const before = (await onDisk(ui, GROUP))!;
    await openNote(ui, GROUP);
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text),
      [GROUP, `${before.trimEnd()}\n\n## Direction\n\n| Agent | Directed by |\n| --- | --- |\n| English Voice | German Voice |\n`]);
    const found = await waitForChecks(ui, "the checks to refuse an agent as the director", "some");
    assert.equal(found.failures, 1);
    await command(ui, "open-checks");
    const listed = await ui.waitFor("the pane to list the failure", () => {
      const pane = app.workspace.getLeavesOfType("companygraph-checks")[0]?.view.contentEl as HTMLElement | undefined;
      const item = pane?.querySelector<HTMLElement>("li.companygraph-open");
      return item ? item.querySelector(".companygraph-message")?.textContent ?? null : null;
    });
    assert.match(listed, /German Voice/);
    assert.match(listed, /nature: human/);
    await session.restore([GROUP]);
    await waitForChecks(ui, "the checks to be clean again", "none");
  });
});
