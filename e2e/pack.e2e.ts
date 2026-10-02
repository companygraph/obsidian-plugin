// An instance that takes a pack, as a person works in it: the checks hold it with the pack's
// schemas, the brief follows the cursor in a note of the pack's type, and a name written in such a
// note is marked, followed and listed like one in a core note.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { mentionsOf, openNote } from "./notes.ts";
import { command, modalText, noModal, onDisk, pressButton, shownInPlan, waitForChecks, waitForModal, waitForNotice } from "./ui.ts";

const skip = available("pack-instance") ? false : "Obsidian or the pack fixture is missing; set OBSIDIAN_BIN, and run npm test once to fetch the fixtures";
const CONTEXT = "model/bounded-contexts/resolution/resolution.md";
const EDGE = "model/bounded-contexts/resolution/concept-designs/edge.md";
const DECLARATION = "model/bounded-contexts/resolution/concept-designs/declaration.md";

describe("an instance that takes the software pack", { skip }, () => {
  let session: Session;
  before(async () => { session = await start({ fixture: "pack-instance" }); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("the checks read the pack's schemas, so a bounded context is no unknown folder", async () => {
    const { ui } = session;
    await waitForChecks(ui, "the pack vault to be checked clean", "none");
    const read = await ui.evaluate(() => ({
      layout: app.plugins.plugins.companygraph.layout,
      schemas: [...app.plugins.plugins.companygraph.schemas.keys()].filter((k: string) => k.startsWith("software/")).sort(),
    }));
    assert.deepEqual(read.layout.packs, [{ name: "software", dir: "meta/software" }]);
    assert.ok(read.schemas.includes("software/bounded-context-schema.md"));
  });

  test("the brief follows the cursor in a bounded context, from the pack's schema", async () => {
    const { ui } = session;
    await openNote(ui, CONTEXT);
    await command(ui, "open-brief");
    const on = await ui.evaluate((heading: string) => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      const at = (editor.getValue() as string).split("\n").indexOf(heading);
      editor.setCursor({ line: at + 2, ch: 0 });
      editor.focus();
      return at;
    }, ["## Responsibilities"]) as number;
    assert.ok(on > 0);
    const seen = await ui.waitFor("the brief to be about Responsibilities", () => {
      const pane = app.workspace.getLeavesOfType("companygraph-brief")[0]?.view.contentEl as HTMLElement | undefined;
      const place = pane?.querySelector(".companygraph-brief-place")?.textContent?.trim();
      return place === "Responsibilities" ? pane!.querySelector(".companygraph-brief-type")?.textContent?.trim() : null;
    });
    assert.equal(seen, "bounded-context");
  });

  test("a name in a pack note's table, and in its Properties, is marked and carries the entity's path", async () => {
    const { ui } = session;
    await openNote(ui, EDGE);
    const cell = await ui.waitFor("a cell to carry a name's path", () =>
      document.querySelector(".cm-table-widget td.companygraph-ref[data-companygraph-path]")?.getAttribute("data-companygraph-path") ?? null);
    assert.equal(cell, DECLARATION);
    const pills = await ui.waitFor("Properties values to carry the paths of the names", () => {
      const paths = Array.from(document.querySelectorAll(".metadata-container .companygraph-ref[data-companygraph-path]")).map((el) => el.getAttribute("data-companygraph-path"));
      return paths.length >= 2 ? paths : null;
    }) as string[];
    assert.ok(pills.includes("model/sources/local.md") && pills.includes("model/concepts/reference.md"), pills.join(", "));
  });

  test("the references pane lists a pack note under what it names", async () => {
    const { ui } = session;
    const under = await mentionsOf(ui, "model/concepts/reference.md");
    assert.ok(under.some((m) => m.path === EDGE && m.declared === "refines"));
    const underDeclaration = await mentionsOf(ui, DECLARATION);
    assert.ok(underDeclaration.some((m) => m.path === EDGE && m.declared.includes("Concept")));
  });

  test("Move this vault's core moves a pack vault and does not take the pack's files for foreign ones", async () => {
    const { ui } = session;
    // As the release before this one left the vault: the pack's aggregate schema not there, on disk
    // or in the manifest, so that the move has one file of the pack's to write.
    await ui.evaluate(async () => {
      const manifest = ".companygraph/manifest.json";
      const was = JSON.parse(await app.vault.adapter.read(manifest));
      delete was.files["meta/software/aggregate-schema.md"];
      await app.vault.adapter.write(manifest, `${JSON.stringify(was, null, 2)}\n`);
      await app.vault.adapter.remove("meta/software/aggregate-schema.md");
    });
    await command(ui, "move-core");
    await waitForModal(ui, "Move this vault's core");
    await ui.waitFor("the plan to be shown", () => /Writes /.test(document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "") || null);
    const shown = await modalText(ui);
    assert.doesNotMatch(shown, /nothing was trusted/);
    assert.match(shown, shownInPlan("meta/software/aggregate-schema.md"));
    // The plan shows the aggregate schema inside its folder's count; that the move writes it, and
    // the manifest records it as the pack's, is read once the move is made.
    await pressButton(ui, "Move it");
    await noModal(ui);
    await waitForNotice(ui, "^Core ");
    assert.ok(await onDisk(ui, "meta/software/aggregate-schema.md"), "the move wrote the pack's aggregate schema");
    const after = JSON.parse((await onDisk(ui, ".companygraph/manifest.json"))!);
    assert.ok(after.files["meta/software/aggregate-schema.md"], "the manifest records the aggregate schema");
    await waitForChecks(ui, "the moved pack vault to be checked", "none");
  });
});
