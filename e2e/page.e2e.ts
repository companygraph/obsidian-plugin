// What the plugin does to the page of an entity: the two pickers and Remove section, the marks
// beside declared headings, the lock on them, the line that stands in for a required section
// that is missing, and the writing brief that follows the cursor.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, editorText, openNote } from "./notes.ts";
import { clearNotices, command, onDisk, pick, promptItems, waitForNotice, waitForPrompt } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

// Puts the note's cursor at the end of the first line that is exactly `text`, with the focus in the editor.
// The focus goes to the note's own CodeMirror view first and the selection is set after it, not
// through `editor.setCursor` and `editor.focus()`: a live-preview table keeps an editor of its own
// for the cell last edited, `editor.focus()` hands the focus back to that cell, and a selection
// set while the cell still holds the focus is pulled back into the table, so a keystroke or a
// command meant for a heading lands in a table row instead. A note with a table after its
// required heading, as a decision has, is where an earlier test leaves such a cell open.
const cursorOn = (text: string) => {
  const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
  const line = (editor.getValue() as string).split("\n").indexOf(text);
  if (line < 0) return false;
  const cm = editor.cm;
  cm.contentDOM.focus();
  cm.dispatch({ selection: { anchor: cm.state.doc.line(line + 1).to }, scrollIntoView: true });
  cm.focus();
  return true;
};

// Leaves a live-preview table the way a person does, by clicking the heading nearest the cursor,
// over the DevTools protocol. While a table's cell editor is open, Obsidian pulls a selection set
// from code back into the cell and scrolls the note back to it, so neither a programmatic cursor
// nor a click on a heading out of view reaches the note; a click on the heading above the table,
// which stays in view, closes the cell editor.
const leaveTable = async (ui: Session["ui"]) => {
  await ui.click(() => {
    const headings = Array.from(document.querySelectorAll<HTMLElement>(".cm-line.HyperMD-header"));
    return headings.length ? headings[headings.length - 1] : null;
  });
  await ui.waitFor("no table cell to hold the focus", () =>
    !(document.activeElement as HTMLElement | null)?.closest(".cm-table-widget, .table-cell-wrapper"));
};

describe("the page of an entity", { skip }, () => {
  let session: Session;
  // A note found in the fixture: one declared section it may still take, one required one it has.
  let note: { path: string; type: string; addable: string[]; required: string };
  before(async () => {
    session = await start();
    note = await session.ui.evaluate(() => {
      const plugin = app.plugins.plugins.companygraph;
      for (const named of plugin.named as { path: string; type: string }[]) {
        const vocabulary = plugin.vocabulary.get(named.type);
        const text = plugin.files.get(named.path) as string | undefined;
        if (!vocabulary || !text) continue;
        const has = new Set(text.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim()));
        const addable = (vocabulary.sections as { heading: string; required: boolean }[]).filter((s) => !s.required && !has.has(s.heading)).map((s) => s.heading);
        const required = (vocabulary.sections as { heading: string; required: boolean }[]).find((s) => s.required && has.has(s.heading))?.heading;
        if (addable.length && required) return { path: named.path, type: named.type, addable, required };
      }
      throw new Error("the fixture has no entity with a section to add and a required one in place");
    });
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Add a section offers what the schema still allows and writes the one picked; its mark removes it again", async () => {
    const { ui } = session;
    await openNote(ui, note.path);
    await ui.evaluate(() => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.focus());
    await command(ui, "add-section");
    assert.equal(await waitForPrompt(ui), "A section this page may still take");
    assert.deepEqual((await promptItems(ui)).map((item) => item.replace(" (required)", "")).sort(), [...note.addable].sort());
    await pick(ui, note.addable[0]);
    await ui.waitFor("the section to be written into the note", (heading: string) =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").includes(`## ${heading}`), [note.addable[0]]);

    // An optional section's mark carries a way to take it out again.
    await ui.click((heading: string) => {
      const lines = Array.from(document.querySelectorAll<HTMLElement>(".cm-line"));
      return lines.find((l) => l.innerText.trim().startsWith(heading))?.querySelector(".companygraph-heading-remove");
    }, [note.addable[0]]);
    await ui.waitFor("the section to be gone again", (heading: string) =>
      !(app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").includes(`## ${heading}`), [note.addable[0]]);
  });

  test("Remove section takes an optional section out and refuses a required one", async () => {
    const { ui } = session;
    await openNote(ui, note.path);
    await ui.evaluate(() => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.focus());
    await command(ui, "add-section");
    await waitForPrompt(ui);
    await pick(ui, note.addable[0]);
    await ui.waitFor("the cursor to stand in the new section", cursorOn, [`## ${note.addable[0]}`]);
    await command(ui, "remove-section");
    await ui.waitFor("the optional section to be removed", (heading: string) =>
      !(app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").includes(`## ${heading}`), [note.addable[0]]);

    await clearNotices(ui);
    // Removing the last section leaves the cursor at the end of the section above it, which in a
    // decision is the Bears on table; the table is left as a person would, and the cursor set.
    await leaveTable(ui);
    assert.equal(await ui.evaluate(cursorOn, [`## ${note.required}`]), true);
    await command(ui, "remove-section");
    await waitForNotice(ui, "is required by the schema and cannot be removed");
    assert.ok((await ui.evaluate(editorText)).split("\n").includes(`## ${note.required}`));
  });

  test("a declared heading cannot be typed into, and says so; the H1 can", async () => {
    const { ui } = session;
    await openNote(ui, note.path);
    const before = await ui.evaluate(editorText);
    await clearNotices(ui);
    assert.equal(await ui.evaluate(cursorOn, [`## ${note.required}`]), true);
    await ui.type("x");
    await waitForNotice(ui, "is the schema's heading and cannot be edited here");
    assert.equal(await ui.evaluate(editorText), before);

    const h1 = before.split("\n").find((l) => l.startsWith("# "))!;
    assert.equal(await ui.evaluate(cursorOn, [h1]), true);
    await ui.type("x");
    await ui.waitFor("the H1 to take the typing", (line: string) =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").includes(line), [`${h1}x`]);
    await ui.press("Backspace");
    await ui.waitFor("the H1 to be as it was", (text: string) => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() === text, [before]);
  });

  test("a required section that is missing is shown as a line to click, and the click writes it", async () => {
    const { ui } = session;
    const was = (await onDisk(ui, note.path))!;
    const lines = was.split("\n");
    const from = lines.indexOf(`## ${note.required}`);
    let to = from + 1;
    while (to < lines.length && !lines[to].startsWith("## ")) to++;
    await openNote(ui, note.path);
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text), [note.path, [...lines.slice(0, from), ...lines.slice(to)].join("\n")]);
    const says = await ui.waitFor("the missing section's line to be shown", (heading: string) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(".companygraph-missing")).find((m) => m.innerText.includes(heading));
      return el ? el.getAttribute("aria-label") : null;
    }, [note.required]);
    assert.equal(says, "Required section missing: click to add");
    await ui.click((heading: string) => Array.from(document.querySelectorAll<HTMLElement>(".companygraph-missing")).find((m) => m.innerText.includes(heading)), [note.required]);
    await ui.waitFor("the heading to be written", (heading: string) =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").includes(`## ${heading}`), [note.required]);
    await session.restore([note.path]);
  });

  test("Add a field offers what the schema still allows and writes the key into the frontmatter", async () => {
    const { ui } = session;
    const lacking = await ui.evaluate(() => {
      const plugin = app.plugins.plugins.companygraph;
      for (const named of plugin.named as { path: string; type: string }[]) {
        const vocabulary = plugin.vocabulary.get(named.type);
        const text = plugin.files.get(named.path) as string | undefined;
        if (!vocabulary || !text) continue;
        const keys = new Set(text.split("\n---")[0].split("\n").map((l) => l.split(":")[0]));
        const absent = (vocabulary.fields as { name: string }[]).map((f) => f.name).filter((name) => !keys.has(name));
        if (absent.length) return { path: named.path, absent };
      }
      throw new Error("every entity of the fixture has every field");
    });
    await openNote(ui, lacking.path);
    await command(ui, "add-field");
    assert.equal(await waitForPrompt(ui), "A field this file may still take");
    assert.deepEqual((await promptItems(ui)).map((item) => item.replace(" (required)", "")).sort(), [...lacking.absent].sort());
    await pick(ui, lacking.absent[0]);
    await ui.waitFor("the key to be in the file's frontmatter", async (at: string, key: string) =>
      ((await app.vault.adapter.read(at)) as string).split("\n---")[0].split("\n").some((l) => l.startsWith(`${key}:`)), [lacking.path, lacking.absent[0]]);
    const focus = await ui.waitFor("the new property's row to hold the focus", (key: string) =>
      document.activeElement?.closest?.(".metadata-property")?.getAttribute("data-property-key") === key.toLowerCase(), [lacking.absent[0]]);
    assert.equal(focus, true);
    await session.restore([lacking.path]);
  });

  test("the writing brief follows the cursor from one section to another", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await command(ui, "open-brief");
    const sections = [...new Set((await ui.evaluate(editorText)).split("\n").filter((l) => l.startsWith("## ")))];
    assert.ok(sections.length > 1, "the note has two sections to move between");
    const seen: string[] = [];
    for (const heading of sections.slice(0, 2)) {
      await openNote(ui, PROFILE);
      assert.equal(await ui.evaluate(cursorOn, [heading]), true);
      // Down into the section's body, by a real key, which is what moves a person's cursor.
      await ui.press("ArrowDown");
      seen.push(await ui.waitFor(`the brief to be about ${heading}`, (want: string) => {
        const pane = app.workspace.getLeavesOfType("companygraph-brief")[0]?.view.contentEl as HTMLElement | undefined;
        // textContent, not innerText: the type is drawn in capitals by a style, and is not written so.
        const place = pane?.querySelector(".companygraph-brief-place")?.textContent?.trim();
        return place === want ? `${pane!.querySelector(".companygraph-brief-type")?.textContent?.trim()} ${place}` : null;
      }, [heading]));
    }
    assert.deepEqual(seen, sections.slice(0, 2).map((heading) => `profile ${heading}`));
  });
});
