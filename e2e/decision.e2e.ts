// The decision type as a person writes it in the vault: New entity asks for decided and leads
// the filename with its year, completion offers the vault's kinds and statuses, and the
// references pane lists a decision under the seat that made it, the status it is in and the
// objective it serves.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { mentionsOf, openNote } from "./notes.ts";
import { command, intoField, noModal, onDisk, pick, pressButton, promptItems, waitForModal, waitForPrompt } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const ROLE = "model/decisions/2026-architect-role.md";
const CAS = "model/decisions/2026-first-cas.md";
const MASTER = "model/strategic-objectives/a-continuing-education-master-s-in-ai-leadership.md";
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

describe("the decision type", { skip }, () => {
  let session: Session;
  before(async () => {
    // A fixture from before the instance was seeded would let every test below pass on nothing.
    assert.ok(fs.existsSync(path.join("test", "fixtures", "mental-model", ROLE)), "the fixture instance holds the career break's decisions");
    session = await start();
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("New entity offers decision, asks for decided and leads the filename with its year", async () => {
    const { ui } = session;
    await openNote(ui, ROLE);
    await command(ui, "new-entity");
    await waitForPrompt(ui);
    assert.ok((await promptItems(ui)).some((item) => item.startsWith("decision —")));
    await pick(ui, "decision —");
    await waitForModal(ui, "New decision");
    await intoField(ui, "Name");
    await ui.type("E2E Probe Decision");
    await intoField(ui, "decided");
    await ui.type("2031-04");
    await pressButton(ui, "Create");
    await noModal(ui);
    const at = await ui.waitFor("the new decision to be in front", () => {
      const p = app.workspace.getActiveFile()?.path as string | undefined;
      return p?.startsWith("model/decisions/2031-") ? p : null;
    });
    const text = (await onDisk(ui, at))!;
    assert.match(text, /\ndecided: "?2031-04"?\n/);
    assert.match(text, /# E2E Probe Decision\n/);
    assert.match(text, /## The question/);
    assert.match(text, /## Alternatives/);
    assert.match(text, /## Why/);
    assert.match(text, /## Consequences/);
  });

  test("kind and status complete to the vault's decision kinds and statuses", async () => {
    const { ui } = session;
    await openNote(ui, ROLE);
    await sourceMode(ui, true);
    // Clear the value on a line and read what the suggest offers, as kpi.e2e.ts does.
    const offeredOn = async (prefix: string) => {
      await ui.evaluate((p: string) => {
        const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
        const line = (editor.getValue() as string).split("\n").findIndex((l) => l.startsWith(p));
        editor.setSelection({ line, ch: p.length }, { line, ch: (editor.getLine(line) as string).length });
        editor.focus();
      }, [prefix]);
      await ui.press("Backspace");
      const items = await ui.waitFor(`values to be offered after "${prefix}"`, offered);
      await ui.press("Escape");
      return items as string[];
    };
    assert.deepEqual([...(await offeredOn("kind: "))].sort(), ["Career", "Portfolio"]);
    assert.deepEqual([...(await offeredOn("status: "))].sort(), ["Dropped", "Proposed", "Revised", "Standing"]);
    await sourceMode(ui, false);
    await session.restore([ROLE]);
  });

  // Core 0.44.0: a decision serves the objectives it was made for, and the one list in the
  // first CAS's frontmatter is its serves.
  test("serves completes to the vault's strategic objectives", async () => {
    const { ui } = session;
    await openNote(ui, CAS);
    await sourceMode(ui, true);
    await ui.evaluate(() => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      const line = (editor.getValue() as string).split("\n").findIndex((l) => l.startsWith("  - "));
      editor.setSelection({ line, ch: 4 }, { line, ch: (editor.getLine(line) as string).length });
      editor.focus();
    }, []);
    await ui.press("Backspace");
    const items = (await ui.waitFor("objectives to be offered for serves", offered)) as string[];
    await ui.press("Escape");
    assert.ok(items.includes("A continuing-education master's in AI leadership"), items.join(", "));
    await sourceMode(ui, false);
    await session.restore([CAS]);
  });

  test("the references pane lists a decision under its seat, its status and the value it upholds", async () => {
    const { ui } = session;
    const underOwner = await mentionsOf(ui, "model/roles/owner.md");
    assert.ok(underOwner.some((m) => m.path === ROLE && m.declared === "by"));
    const underStanding = await mentionsOf(ui, "model/decision-statuses/standing.md");
    assert.ok(underStanding.some((m) => m.path === ROLE && m.declared === "status"));
    const underValue = await mentionsOf(ui, "model/values/decide-well-over-build-fast.md");
    assert.ok(underValue.some((m) => m.path === ROLE && m.declared === "upholds"));
    const underMaster = await mentionsOf(ui, MASTER);
    assert.ok(underMaster.some((m) => m.path === CAS && m.declared === "serves"));
  });
});
