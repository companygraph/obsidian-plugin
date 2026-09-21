// Names, where the plugin offers them and where it follows them: completion in an empty cell, by
// what is typed, by its command, and for a value in Source mode; and Cmd+click on a name, in a
// drawn cell, on a Properties pill and in Source mode, opening the entity it names.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote, tablesOf } from "./notes.ts";
import { command, entityOf, frontPath, onDisk } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const offered = () => {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
  return items.length ? items : null;
};
const sourceMode = async (ui: Session["ui"], on: boolean) => {
  await ui.evaluate(async (source: boolean) => {
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
    const state = view.getState();
    await view.setState({ ...state, mode: "source", source }, { history: false });
  }, [on]);
  await ui.waitFor(`the editor to be in ${on ? "Source mode" : "Live Preview"}`, (source: boolean) =>
    app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.getState().source === source, [on]);
};

describe("names, offered and followed", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("a click into an empty cell offers the names its column declares, and the one chosen is written", async () => {
    const { ui } = session;
    const before = (await onDisk(ui, PROFILE))!;
    const skills = tablesOf(before).find((t) => t.header.join("|") === "Skill|Level")!;
    const lines = before.split("\n");
    await openNote(ui, PROFILE);
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text),
      [PROFILE, [...lines.slice(0, skills.last + 1), "|  |  |", ...lines.slice(skills.last + 1)].join("\n")]);
    const row = skills.last - skills.first;
    await ui.click((at: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[at]?.children[1], [row]);
    await ui.waitFor("the empty Level cell to be open", focusedCell);
    const levels = await ui.waitFor("the names of the column's type to be offered", offered);
    const declared = await ui.evaluate(() => (app.plugins.plugins.companygraph.named as { type: string; name: string }[]).filter((n) => n.type === "proficiency-level").map((n) => n.name).sort());
    assert.deepEqual([...levels].sort(), declared);

    await ui.press("ArrowDown");
    await ui.press("Enter");
    const written = await ui.waitFor("the chosen level to be written into the row", (at: number, names: string[]) => {
      const line = (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n")[at];
      return names.find((name) => line.includes(`| ${name}`)) ?? null;
    }, [skills.last + 1, declared]);
    assert.ok(declared.includes(written));
    await session.restore([PROFILE]);
  });

  test("what is typed narrows what is offered, and Complete here brings the list back", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await ui.click(() => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[1]?.children[1]);
    await ui.waitFor("the Level cell to be open", focusedCell);
    await ui.press("a", { mod: true });
    await ui.type("Ex");
    const narrowed = await ui.waitFor("the list to be narrowed to what was typed", () => {
      const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
      return items.length && items.every((item) => item.toLowerCase().includes("ex")) ? items : null;
    });
    assert.ok(narrowed.includes("Expert"));
    await ui.press("Escape");
    await ui.waitFor("the list to be closed", () => !document.querySelector(".suggestion-container"));
    await command(ui, "complete-here");
    assert.ok((await ui.waitFor("Complete here to bring the list back", offered)).includes("Expert"));
    await ui.press("Escape");
    await session.restore([PROFILE]);
  });

  test("in Source mode a value is completed from the names its field declares", async () => {
    const { ui } = session;
    const note = await entityOf(ui, "experience");
    await openNote(ui, note);
    await sourceMode(ui, true);
    const was = await ui.evaluate(() => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      const line = (editor.getValue() as string).split("\n").findIndex((l) => l.startsWith("source: "));
      const text = editor.getLine(line) as string;
      editor.setSelection({ line, ch: "source: ".length }, { line, ch: text.length });
      editor.focus();
      return text.slice("source: ".length);
    });
    await ui.press("Backspace");
    const sources = await ui.waitFor("the sources to be offered", offered);
    assert.ok(sources.includes(was));
    await ui.press("ArrowDown");
    await ui.press("Enter");
    await ui.waitFor("a source to be written as the value", (names: string[]) => {
      const line = (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").find((l) => l.startsWith("source: "))!;
      return names.includes(line.slice("source: ".length).trim());
    }, [sources]);
    await sourceMode(ui, false);
    await session.restore([note]);
  });

  test("Cmd+click on a name opens the entity it names: in a drawn cell, on a Properties pill, in Source mode", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    const cell = await ui.waitFor("a cell to carry a name's path", () =>
      document.querySelector(".cm-table-widget td.companygraph-ref[data-companygraph-path]")?.getAttribute("data-companygraph-path") ?? null);
    await ui.click(".cm-table-widget td.companygraph-ref[data-companygraph-path] .table-cell-wrapper", [], { mod: true });
    await ui.waitFor("the named entity to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [cell]);

    const experience = await entityOf(ui, "experience", "\nskills:\n");
    await openNote(ui, experience);
    const pill = await ui.waitFor("a Properties pill to carry a name's path", () =>
      document.querySelector(".multi-select-pill.companygraph-ref[data-companygraph-path]")?.getAttribute("data-companygraph-path") ?? null);
    await ui.click(".multi-select-pill.companygraph-ref[data-companygraph-path] .multi-select-pill-content", [], { mod: true });
    await ui.waitFor("the pill's entity to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [pill]);

    await openNote(ui, experience);
    await sourceMode(ui, true);
    await ui.click(".cm-line .companygraph-ref", [], { mod: true });
    await ui.waitFor("the entity named in Source mode to be in front", (from: string) => {
      const at = app.workspace.getActiveFile()?.path as string | undefined;
      return at && at !== from ? at : null;
    }, [experience]);
    assert.notEqual(await frontPath(ui), experience);
    await openNote(ui, experience);
    await sourceMode(ui, false);
  });
});
