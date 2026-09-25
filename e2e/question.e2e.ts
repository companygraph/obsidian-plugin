// A question's Rests on as a person writes one (core 0.40.0, meta-model v0.45.0): a row's cells
// complete from the row, the references pane lists the question under what it rests on, a name
// in a row opens its entity and one that names nothing is marked, and renaming the owner a row
// names carries its Owner cell. The fixture holds questions of its own; the vault is given one
// more, whose rows are this file's to edit and put back.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote, tablesOf } from "./notes.ts";
import { clearNotices, command, intoField, modalText, noModal, onDisk, pressButton, waitForChecks, waitForModal, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

const QUESTION = "model/questions/who-spoke-at-eclipse-mdd-day.md";
const EXPERIENCE = "model/profiles/robert-blust/experiences/2010-eclipse-mdd-day.md";
const TEXT = [
  "---", "source: Local", "---", "",
  "# Who spoke at Eclipse MDD Day?", "",
  "> The experience says who spoke, and the skill what it took.", "",
  "## Rests on", "",
  "| Type | Entity | Owner | For |",
  "| --- | --- | --- | --- |",
  "| experience | Eclipse MDD Day 2010 | Robert Blust | who spoke |",
  "| skill | Public speaking | | what it took |",
  "",
].join("\n");
const ROW = "| experience | Eclipse MDD Day 2010 | Robert Blust | who spoke |";

const offered = () => {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
  return items.length ? items : null;
};

// The question as it was written, in the file and in what the plugin read, after a test edited it.
const putBack = async (ui: Session["ui"]) => {
  await ui.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); });
  await ui.waitFor("the question to be as it was written", async (at: string, as: string) => {
    const file = app.vault.getAbstractFileByPath(at);
    if ((await app.vault.read(file)) !== as) {
      await app.vault.modify(file, as);
      return false;
    }
    return app.plugins.plugins.companygraph.files.get(at) === as;
  }, [QUESTION, TEXT]);
};

// A test that edits the question puts it back however it ends, so a failure cannot leave the
// model unparseable for the tests after it; after a failure the failure is what is reported.
const puttingBack = async (ui: Session["ui"], body: () => Promise<void>) => {
  let done = false;
  try {
    await body();
    done = true;
  } finally {
    if (done) await putBack(ui);
    else await putBack(ui).catch(() => {});
  }
};

describe("a question's Rests on", { skip }, () => {
  let session: Session;
  before(async () => {
    session = await start();
    const { ui } = session;
    await ui.evaluate(async (at: string, text: string) => {
      await app.vault.create(at, text);
    }, [QUESTION, TEXT]);
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to pass with a question in the vault", "none");
    await ui.waitFor("the plugin to know the question", (at: string) =>
      (app.plugins.plugins.companygraph.named as { path: string }[]).some((n) => n.path === at), [QUESTION]);
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("the references pane lists the question under the experience it rests on, and a click opens its row", async () => {
    const { ui } = session;
    await openNote(ui, EXPERIENCE);
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:open-references"));
    const said = await ui.waitFor("the pane to list the question", () => {
      const text = (app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined)?.innerText ?? "";
      return text.includes("who-spoke-at-eclipse-mdd-day") ? text : null;
    });
    assert.match(said, /Rests on · Entity/);
    await ui.click(() => Array.from(document.querySelectorAll<HTMLElement>(".companygraph-file"))
      .find((f) => f.querySelector(".companygraph-file-name")?.textContent?.startsWith("who-spoke-at-eclipse-mdd-day"))
      ?.querySelector("li.companygraph-open"));
    await ui.waitFor("the question to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [QUESTION]);
  });

  test("a name in a row carries its entity's path, Cmd+click opens it, and a row naming another owner is marked unresolved", async () => {
    const { ui } = session;
    await openNote(ui, QUESTION);
    const owner = await ui.waitFor("the Owner cell to carry the profile's path", (at: string) =>
      document.querySelector(`.cm-table-widget td.companygraph-ref[data-companygraph-path="${at}"]`) ? at : null, [PROFILE]);
    assert.equal(owner, PROFILE);
    await ui.click((at: string) => document.querySelector(`.cm-table-widget td.companygraph-ref[data-companygraph-path="${at}"] .table-cell-wrapper`), [EXPERIENCE], { mod: true });
    await ui.waitFor("the experience to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [EXPERIENCE]);

    await openNote(ui, QUESTION);
    await puttingBack(ui, async () => {
      await ui.evaluate(async (at: string, row: string) => {
        const file = app.vault.getAbstractFileByPath(at);
        await app.vault.modify(file, ((await app.vault.read(file)) as string).replace(row, row.replace("Robert Blust", "AI Agent")));
      }, [QUESTION, ROW]);
      const marked = await ui.waitFor("the Entity cell to be marked as naming nothing", () => {
        const cell = Array.from(document.querySelectorAll<HTMLElement>(".cm-table-widget td")).find((td) => td.innerText.trim() === "Eclipse MDD Day 2010");
        return cell?.classList.contains("is-unresolved") ? cell.innerText.trim() : null;
      });
      assert.equal(marked, "Eclipse MDD Day 2010");
    });
  });

  test("the Type cell offers the core's types, and the Entity cell the names of the row's owner", async () => {
    const { ui } = session;
    const table = tablesOf(TEXT)[0];
    const lines = TEXT.split("\n");
    await openNote(ui, QUESTION);
    await puttingBack(ui, async () => {
      await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text),
        [QUESTION, [...lines.slice(0, table.last + 1), "|  |  |  |  |", "| experience |  | Robert Blust |  |", ...lines.slice(table.last + 1)].join("\n")]);
      const blank = table.last - table.first;

      await ui.click((at: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[at]?.children[0], [blank]);
      const types = await ui.waitFor("the types of the core to be offered", offered);
      const declared = await ui.evaluate(() => [...(app.plugins.plugins.companygraph.vocabulary as Map<string, unknown>).keys()].sort());
      assert.deepEqual([...types].sort(), declared);
      assert.ok(types.includes("experience") && types.includes("question"));
      await ui.press("Escape");
      await ui.waitFor("the list to be closed", () => !document.querySelector(".suggestion-container"));

      await ui.click((at: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[at]?.children[1], [blank + 1]);
      const names = await ui.waitFor("the names of the owner's experiences to be offered", offered);
      const own = await ui.evaluate((folder: string) => (app.plugins.plugins.companygraph.named as { type: string; name: string; path: string }[])
        .filter((n) => n.type === "experience" && n.path.startsWith(folder)).map((n) => n.name).sort(), ["model/profiles/robert-blust/"]);
      assert.deepEqual([...names].sort(), own);
      await ui.press("ArrowDown");
      await ui.press("Enter");
      const written = await ui.waitFor("the chosen experience to be written into the row", (at: number, choices: string[]) => {
        const line = (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n")[at];
        // Cell by cell, since Obsidian pads a table's columns when it writes one.
        return choices.find((name) => line.split("|").map((c) => c.trim()).includes(name)) ?? null;
      }, [table.last + 2, own]);
      assert.ok(own.includes(written));
    });
  });

  // Last: it renames the fixture's profile, and every test above reads it by its name.
  test("renaming the owner a row names rewrites the row's Owner cell, and the checks stay clean", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await clearNotices(ui);
    await command(ui, "rename-entity");
    await waitForModal(ui, 'Rename profile "Robert Blust"');
    await intoField(ui, "New name");
    await ui.press("a", { mod: true });
    await ui.type("Rob Blust");
    await pressButton(ui, "Review");
    await ui.waitFor("the review to list the question", (at: string) => (document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "").includes(at), [QUESTION]);
    assert.match(await modalText(ui), /who-spoke-at-eclipse-mdd-day/);
    await pressButton(ui, "Rename");
    await waitForNotice(ui, "^Renamed to ");
    await noModal(ui);
    await ui.waitFor("the question's row to name the owner by its new name", async (at: string, row: string) =>
      ((await app.vault.adapter.read(at)) as string).includes(row), [QUESTION, ROW.replace("Robert Blust", "Rob Blust")]);
    assert.ok(!(await onDisk(ui, QUESTION))!.includes("| Robert Blust |"));
    await waitForChecks(ui, "the checks to be clean after the rename", "none");
  });
});
