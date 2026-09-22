// Completion inside the Properties widget. Obsidian's own suggestions there are the values the
// vault's files hold, so a role removed from the one file that named it was gone from them, which
// is what the owner met. A declared field's input now offers from the schema: the type's names
// less the pills held, an enum's values, and the pictures beside the note for an image. The
// selectors are written out where a page function reads them: a page function runs in the
// browser and sees nothing of this file.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote } from "./notes.ts";
import { command, waitForChecks } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const ROLES = '.metadata-property[data-property-key="roles"]';
const NATURE = '.metadata-property[data-property-key="nature"]';
const IMAGE = '.metadata-property[data-property-key="image"]';
const META = path.join(import.meta.dirname, "..", "test", "fixtures", "meta-model");
const SCHEMA = fs.readFileSync(path.join(META, "core", "profile-schema.md"), "utf8");
const PNG = [...fs.readFileSync(path.join(META, "example", "model", "profiles", "ai-agent", "ai-agent.png"))];
const FOLDER = PROFILE.slice(0, PROFILE.lastIndexOf("/"));


describe("completion in the Properties widget", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  // Each test leaves the note as it found it: Escape leaves what was typed in a widget input,
  // and the next test would meet a note with a value the schema refuses.
  let original: string;
  before(async () => { original = (await session.ui.evaluate(async (note: string) => (await app.vault.read(app.vault.getAbstractFileByPath(note) as never)) as string, [PROFILE])) as string; });
  afterEach(async (t) => {
    if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name);
    await session.ui.press("Escape");
    await session.ui.evaluate(async (note: string, text: string) => { const f = app.vault.getAbstractFileByPath(note) as never; if (((await app.vault.read(f)) as string) !== text) await app.vault.modify(f, text); }, [PROFILE, original]);
    await session.ui.waitFor("the note to be as it was", async (note: string, text: string) => ((await app.vault.read(app.vault.getAbstractFileByPath(note) as never)) as string) === text, [PROFILE, original]);
  });
  after(async () => { await session?.stop(); });

  // The popup's entries, by the text they carry.
  const offered = (ui: Session["ui"], what: string) =>
    ui.waitFor(what, () => {
      const items = Array.from(document.querySelectorAll(".suggestion-item")).map((s) => s.textContent?.trim() ?? "");
      return items.length ? items : null;
    });

  test("a role removed from the only file that held it is offered again, and Enter writes the pill", async () => {
    const { ui } = session;
    // A second role first: a list whose last pill goes is redrawn by Obsidian as a text field,
    // and the owner's vault registers the property's type where this fixture does not.
    await ui.evaluate(async (note: string) => { const f = app.vault.getAbstractFileByPath(note) as never; await app.vault.modify(f, ((await app.vault.read(f)) as string).replace("roles:\n  - Owner\n", "roles:\n  - Owner\n  - Reviewer\n")); }, [PROFILE]);
    await openNote(ui, PROFILE);
    // What is offered comes from the last rebuild that parsed; under load the first one may not
    // have run by the time the input is used, and then there is nothing to offer yet.
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to have run over the note with two roles", "none");
    await ui.waitFor("the roles row with two pills", () => document.querySelectorAll('.metadata-property[data-property-key="roles"] .multi-select-pill-content').length === 2);
    await ui.click(`${ROLES} .multi-select-pill-remove-button`);
    await ui.waitFor("the Owner pill to be gone", () => !Array.from(document.querySelectorAll('.metadata-property[data-property-key="roles"] .multi-select-pill-content')).some((p) => p.textContent === "Owner"));
    await ui.waitFor("the note to have lost the role", async () => !/- Owner/.test((await app.vault.read(app.vault.getAbstractFileByPath("model/profiles/robert-blust/robert-blust.md") as never)) as string));
    await ui.click(`${ROLES} .multi-select-input`);
    await ui.type("ow");
    assert.deepEqual(await offered(ui, "Owner to be offered after its removal"), ["Owner"]);
    await ui.press("Enter");
    await ui.waitFor("the pill to be back", () => Array.from(document.querySelectorAll('.metadata-property[data-property-key="roles"] .multi-select-pill-content')).some((p) => p.textContent === "Owner"));
    const text = await ui.waitFor("the note to name the role again", async () => { const t = (await app.vault.read(app.vault.getAbstractFileByPath("model/profiles/robert-blust/robert-blust.md") as never)) as string; return /^  - Owner$/m.test(t) ? t : null; });
    assert.match(text, /^  - Owner$/m);
  });

  test("a name the list holds is not offered again, and an enum offers its values", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to have run", "none");
    await ui.waitFor("the roles row", () => !!document.querySelector('.metadata-property[data-property-key="roles"] .multi-select-input'));
    await ui.click(`${ROLES} .multi-select-input`);
    await ui.type("o");
    const roles = await offered(ui, "roles other than the held one");
    assert.ok(!roles.includes("Owner") && roles.length > 0, roles.join(", "));
    await ui.press("Escape");
    await ui.click(`${NATURE} .metadata-input-longtext`);
    await ui.press("a", { mod: true });
    await ui.type("ag");
    assert.deepEqual(await offered(ui, "the enum's value that starts with what is typed"), ["agent"]);
    await ui.press("Escape");
  });

  test("an image field offers the pictures beside the note", async () => {
    const { ui } = session;
    await ui.evaluate(async (schema: string, note: string, folder: string, bytes: number[]) => {
      await app.vault.adapter.write("meta/core/profile-schema.md", schema);
      await app.vault.createBinary(`${folder}/picture.png`, new Uint8Array(bytes).buffer);
      const file = app.vault.getAbstractFileByPath(note) as never;
      await app.vault.modify(file, ((await app.vault.read(file)) as string).replace("\n---\n", "\nimage:\n---\n"));
    }, [SCHEMA, PROFILE, FOLDER, PNG]);
    // The rebuild has to have read the schema that declares the field before the input is used.
    await ui.waitFor("the vocabulary to declare image", () => !!(app as any).plugins.plugins.companygraph.vocabulary.get("profile")?.fields.some((f: { name: string }) => f.name === "image"));
    await openNote(ui, PROFILE);
    await ui.waitFor("the image row", () => !!document.querySelector('.metadata-property[data-property-key="image"] .metadata-input-longtext'));
    await ui.waitFor("the suggest to be on the image input", () => !!document.querySelector('.metadata-property[data-property-key="image"] .metadata-input-longtext[data-companygraph-suggest]'));
    await ui.click(`${IMAGE} .metadata-input-longtext`);
    await ui.type("p");
    assert.deepEqual(await offered(ui, "the picture beside the note"), ["picture.png"]);
    await ui.press("Enter");
    const text = await ui.waitFor("the note to name the picture", async () => { const t = (await app.vault.read(app.vault.getAbstractFileByPath("model/profiles/robert-blust/robert-blust.md") as never)) as string; return /image: picture\.png/.test(t) ? t : null; });
    assert.match(text, /image: picture\.png/);
  });
});
