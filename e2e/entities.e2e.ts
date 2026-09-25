// The three entity commands, as a person runs them: New entity through its two prompts, its
// refusals, Rename entity carrying every reference, Delete entity saying what it breaks.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote } from "./notes.ts";
import { clearNotices, command, frontPath, intoField, modalText, noModal, onDisk, pick, pressButton, promptItems, waitForChecks, waitForModal, waitForNotice, waitForPrompt } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const SKILL = "model/skills/e2e-probe-skill.md";

describe("the entity commands", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("New entity asks the type, then the name, writes the scaffold and opens it on its tagline", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await command(ui, "new-entity");
    assert.equal(await waitForPrompt(ui), "The type of the new entity");
    const offered = await promptItems(ui);
    assert.ok(offered.some((item) => item.startsWith("skill —")), "a type of the model's own");
    assert.ok(offered.some((item) => item.startsWith("experience —")), "a type the profile in front owns");
    await pick(ui, "skill —");
    await waitForModal(ui, "New skill");
    await intoField(ui, "Name");
    await ui.type("E2E Probe Skill");
    await ui.press("Enter");
    await noModal(ui);
    await ui.waitFor("the new skill to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [SKILL]);
    const text = (await onDisk(ui, SKILL))!;
    assert.match(text, /^---\n[\s\S]*?\n---\n\n# E2E Probe Skill\n/);
    const cursor = await ui.evaluate(() => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      return editor.getLine(editor.getCursor().line) as string;
    });
    assert.match(cursor, /^> /, "the cursor stands on the tagline");
  });

  test("New entity refuses no name, and a name the type already has", async () => {
    const { ui } = session;
    for (const [typed, notice] of [["", "A name is needed"], ["E2E Probe Skill", "."]] as const) {
      await clearNotices(ui);
      await command(ui, "new-entity");
      await waitForPrompt(ui);
      await pick(ui, "skill —");
      await waitForModal(ui, "New skill");
      await intoField(ui, "Name");
      if (typed) await ui.type(typed);
      await pressButton(ui, "Create");
      const said = await waitForNotice(ui, notice);
      assert.ok(said.length > 0);
      assert.equal(await ui.evaluate(() => Boolean(document.querySelector(".modal .modal-title"))), true, "the modal stays for another try");
      await ui.press("Escape");
      await noModal(ui);
    }
  });

  test("New entity asks an experience for its start and leads the filename with its year", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await command(ui, "new-entity");
    await waitForPrompt(ui);
    await pick(ui, "experience —");
    await waitForModal(ui, "New experience");
    await intoField(ui, "Name");
    await ui.type("E2E Probe Role");
    await intoField(ui, "start");
    await ui.type("2031-04");
    await pressButton(ui, "Create");
    await noModal(ui);
    const at = await ui.waitFor("the new experience to be in front", () => {
      const path = app.workspace.getActiveFile()?.path as string | undefined;
      return path?.includes("/experiences/2031-") ? path : null;
    });
    assert.match((await onDisk(ui, at))!, /\nstart: "?2031-04"?\n/);
  });

  test("Rename entity reviews what it will change, then carries the file, the H1 and every reference", async () => {
    const { ui } = session;
    // The two entities New entity made above are left with their required values blank, which
    // R9 reads as absent since core 0.41.0, so the checks are not clean until those are filled.
    // Filled here with values the fixture's own skills and experiences carry, as their author
    // would, so the clean checks awaited below are the rename's to keep.
    await ui.evaluate(async (skill: string) => {
      const probes = app.vault.getMarkdownFiles().filter((f: { path: string }) => f.path === skill || /\/experiences\/2031-/.test(f.path));
      if (probes.length !== 2) throw new Error(`expected the probe skill and experience, found ${probes.length}`);
      for (const file of probes)
        await app.vault.modify(file, ((await app.vault.read(file)) as string).replace(/^source:$/m, "source: Local").replace(/^kind:$/m, "kind: Role"));
    }, [SKILL]);
    // A skill the profile names, read from the fixture: the first row of its Skills table.
    const profile = (await onDisk(ui, PROFILE))!;
    const name = profile.split("\n").find((line, i, all) => i > 1 && all[i - 1].startsWith("| ---"))!.split("|")[1].trim();
    const from = await ui.evaluate((skill: string) => app.plugins.plugins.companygraph.named.find((n: { type: string; name: string }) => n.type === "skill" && n.name === skill).path as string, [name]);
    await openNote(ui, from);
    await clearNotices(ui);
    await command(ui, "rename-entity");
    await waitForModal(ui, `Rename skill "${name}"`);
    await intoField(ui, "New name");
    await ui.press("a", { mod: true });
    await ui.type(`${name} Renamed`);
    await pressButton(ui, "Review");
    const plan = await ui.waitFor("the review to list what changes", () => {
      const text = document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "";
      return text.includes("robert-blust") ? text : null;
    });
    assert.match(plan, /robert-blust/);
    await pressButton(ui, "Rename");
    const said = await waitForNotice(ui, "^Renamed to ");
    assert.match(said, /references? with it/);
    await noModal(ui);
    const now = await ui.waitFor("the profile's file to name the skill by its new name", async (at: string, row: string) => {
      const text = (await app.vault.adapter.read(at)) as string;
      return text.includes(row) ? text : null;
    }, [PROFILE, `| ${name} Renamed |`]);
    assert.ok(!now.includes(`| ${name} |`), "no row still names the old name");
    assert.equal(await onDisk(ui, from), null, "the file moved");
    const moved = await frontPath(ui);
    assert.match((await onDisk(ui, moved!))!, new RegExp(`\\n# ${name} Renamed\\n`));
    await waitForChecks(ui, "the checks to be clean after the rename", "none");
  });

  test("Delete entity says what names it, keeps it on Cancel, and on Delete leaves the pane to name what broke", async () => {
    const { ui } = session;
    const target = (await frontPath(ui))!;
    // The rename before this moved the file, and the plugin knows it under its new path only once
    // it has read the vault again; the checks having been clean says nothing of that, since they
    // were clean before the rename as well.
    await ui.waitFor("the plugin to know the entity under its new path", (at: string) =>
      (app.plugins.plugins.companygraph.named as { path: string }[]).some((n) => n.path === at), [target]);
    const title = await ui.evaluate((at: string) => { const n = app.plugins.plugins.companygraph.named.find((x: { path: string }) => x.path === at); return `Delete ${n.type} "${n.name}"`; }, [target]);
    await command(ui, "delete-entity");
    await waitForModal(ui, title);
    assert.match(await modalText(ui), /robert-blust/, "the profile that names it is listed");
    await pressButton(ui, "Cancel");
    await noModal(ui);
    assert.notEqual(await onDisk(ui, target), null);

    await clearNotices(ui);
    await command(ui, "delete-entity");
    await waitForModal(ui, title);
    await pressButton(ui, "Delete");
    await waitForNotice(ui, "^Deleted ");
    await ui.waitFor("the file to be gone", async (at: string) => !(await app.vault.adapter.exists(at)), [target]);
    const broke = await waitForChecks(ui, "the checks to name what no longer resolves", "some");
    assert.ok(broke.failures > 0);
  });
});
