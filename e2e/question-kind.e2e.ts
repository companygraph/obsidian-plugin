// The question kind as a person writes it in the vault: New entity offers it and creates it in
// question-kinds/ with its required section, a question's kind completes to the vault's kinds,
// and the references pane lists a question under the kind it names.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { mentionsOf, openNote } from "./notes.ts";
import { command, intoField, noModal, onDisk, pick, pressButton, promptItems, waitForModal, waitForPrompt } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const CAREER = "model/question-kinds/career.md";
const QUESTION = "model/questions/what-did-robert-study.md";
const offered = () => {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
  return items.length ? items : null;
};
const sourceMode = async (ui: Session["ui"], on: boolean) => {
  await ui.evaluate(async (source: boolean) => {
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
    await view.setState({ ...view.getState(), mode: "source", source }, { history: false });
  }, [on]);
  await ui.waitFor(`the editor to be in ${on ? "Source mode" : "Live Preview"}`, (source: boolean) =>
    app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.getState().source === source, [on]);
};

describe("the question kind", { skip }, () => {
  let session: Session;
  before(async () => {
    // A fixture from before the instance was seeded would let every test below pass on nothing.
    assert.ok(fs.existsSync(path.join("test", "fixtures", "mental-model", CAREER)), "the fixture instance holds its question kinds");
    session = await start();
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("New entity offers question-kind and creates it in question-kinds/ with What it means", async () => {
    const { ui } = session;
    await openNote(ui, CAREER);
    await command(ui, "new-entity");
    await waitForPrompt(ui);
    assert.ok((await promptItems(ui)).some((item) => item.startsWith("question-kind —")));
    await pick(ui, "question-kind —");
    await waitForModal(ui, "New question-kind");
    await intoField(ui, "Name");
    await ui.type("E2E Probe Kind");
    await pressButton(ui, "Create");
    await noModal(ui);
    const at = "model/question-kinds/e2e-probe-kind.md";
    await ui.waitFor("the new kind to be in front", (p: string) => app.workspace.getActiveFile()?.path === p, [at]);
    const text = (await onDisk(ui, at))!;
    assert.match(text, /# E2E Probe Kind\n/);
    assert.match(text, /## What it means/);
    // The fixture never held this file, so restore has nothing to read back; it goes the way
    // Delete entity removes one, as e2e/entities.e2e.ts's probe does.
    await ui.evaluate(async (p: string) => {
      const file = app.vault.getAbstractFileByPath(p);
      if (file) await app.fileManager.trashFile(file);
    }, [at]);
    await ui.waitFor("the probe kind to be gone", (p: string) => !app.vault.getAbstractFileByPath(p), [at]);
  });

  test("a question's kind completes to the vault's question kinds and nothing else", async () => {
    const { ui } = session;
    await openNote(ui, QUESTION);
    await sourceMode(ui, true);
    await ui.evaluate(() => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      const line = (editor.getValue() as string).split("\n").findIndex((l) => l.startsWith("kind: "));
      editor.setSelection({ line, ch: "kind: ".length }, { line, ch: (editor.getLine(line) as string).length });
      editor.focus();
    });
    await ui.press("Backspace");
    const items = (await ui.waitFor("kinds to be offered", offered)) as string[];
    await ui.press("Escape");
    assert.deepEqual([...items].sort(), ["Brand", "Career", "Ideas", "Model and chat"]);
    await sourceMode(ui, false);
    await session.restore([QUESTION]);
  });

  test("the references pane lists a question under its kind", async () => {
    const { ui } = session;
    const underCareer = await mentionsOf(ui, CAREER);
    assert.ok(underCareer.some((m) => m.path === QUESTION && m.declared === "kind"));
  });
});
