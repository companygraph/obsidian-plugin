// The kpi type as a person writes it in the vault: New entity makes one, completion offers the
// direction tokens and the vault's KPIs, and the references pane lists a KPI under what it names.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { mentionsOf, openNote } from "./notes.ts";
import { command, intoField, noModal, onDisk, pick, promptItems, waitForModal, waitForPrompt } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const LEAD = "model/kpis/change-lead-time.md";
const PROBE = "model/kpis/e2e-probe-kpi.md";
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

describe("the kpi type", { skip }, () => {
  let session: Session;
  before(async () => {
    // A fixture from before the instance was seeded would let every test below pass on nothing.
    assert.ok(fs.existsSync(path.join("test", "fixtures", "mental-model", LEAD)), "the fixture instance holds the DORA KPIs");
    session = await start();
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("New entity offers kpi and writes one in kpis/ with its required sections", async () => {
    const { ui } = session;
    await openNote(ui, LEAD);
    await command(ui, "new-entity");
    await waitForPrompt(ui);
    assert.ok((await promptItems(ui)).some((item) => item.startsWith("kpi —")));
    await pick(ui, "kpi —");
    await waitForModal(ui, "New kpi");
    await intoField(ui, "Name");
    await ui.type("E2E Probe KPI");
    await ui.press("Enter");
    await noModal(ui);
    const text = (await onDisk(ui, PROBE))!;
    assert.match(text, /# E2E Probe KPI\n/);
    assert.match(text, /## How it is measured/);
    assert.match(text, /## What it can hide/);
  });

  test("direction completes to its three tokens, and read-with to the vault's KPIs", async () => {
    const { ui } = session;
    await openNote(ui, LEAD);
    await sourceMode(ui, true);
    // Clear the value on a line and read what the suggest offers, as names.e2e.ts does for source.
    // The value is waited for to be gone before the list is asked for, and Complete here asks for
    // it where the cursor stands: in full runs the list the keystroke alone opens was twice seen
    // not open, with the value already cleared, and waiting on it was a race.
    const offeredOn = async (prefix: string) => {
      const line = await ui.evaluate((p: string) => {
        const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
        const at = (editor.getValue() as string).split("\n").findIndex((l) => l.startsWith(p));
        editor.setSelection({ line: at, ch: p.length }, { line: at, ch: (editor.getLine(at) as string).length });
        editor.focus();
        return at;
      }, [prefix]) as number;
      await ui.waitFor(`the value after "${prefix}" to be selected in a focused editor`, (at: number, p: string) => {
        const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
        return editor.hasFocus() && editor.getSelection() === (editor.getLine(at) as string).slice(p.length);
      }, [line, prefix]);
      await ui.press("Backspace");
      await ui.waitFor(`the value after "${prefix}" to be cleared`, (at: number, p: string) =>
        app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getLine(at) === p, [line, prefix]);
      await command(ui, "complete-here");
      const items = await ui.waitFor(`values to be offered after "${prefix}"`, offered);
      await ui.press("Escape");
      return items as string[];
    };
    assert.deepEqual([...(await offeredOn("direction: "))].sort(), ["higher", "lower", "target"]);
    assert.ok((await offeredOn("  - ")).includes("Change Fail Rate"));
    await sourceMode(ui, false);
    await session.restore([LEAD]);
  });

  test("the references pane lists a KPI under its process and under the KPI it is read with", async () => {
    const { ui } = session;
    const underDelivery = await mentionsOf(ui, "model/processes/delivery/delivery.md");
    assert.ok(underDelivery.some((m) => m.path === LEAD && m.declared === "measures"));
    const underFail = await mentionsOf(ui, "model/kpis/change-fail-rate.md");
    assert.ok(underFail.some((m) => m.path === LEAD && m.declared === "read-with"));
  });
});
