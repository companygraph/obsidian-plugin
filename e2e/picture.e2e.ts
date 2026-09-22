// A profile's picture, read by the vault's own reader: the checks hold an image from its bytes
// (R9), and the only reader that hands them bytes here is `readInstance`, through Obsidian's
// `readBinary`. Read as text, a correct picture fails as corrupted, and no test that feeds the
// checks a map would see it. The fixture vendors a core older than the type, so the test gives
// the vault the profile schema of the release this build bundles before it names a picture.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote } from "./notes.ts";
import { command, waitForChecks } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

const META = path.join(import.meta.dirname, "..", "test", "fixtures", "meta-model");
const SCHEMA = fs.readFileSync(path.join(META, "core", "profile-schema.md"), "utf8");
// The example's own picture: a real PNG, 256 by 256, which is the floor R9 sets.
const PNG = [...fs.readFileSync(path.join(META, "example", "model", "profiles", "ai-agent", "ai-agent.png"))];
const FOLDER = PROFILE.slice(0, PROFILE.lastIndexOf("/"));

describe("a profile's picture is read as bytes", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("a named PNG beside the profile passes, and the same bytes named .jpg fail by name", async () => {
    const { ui } = session;
    await ui.evaluate(async (schema: string, note: string, folder: string, bytes: number[]) => {
      await app.vault.adapter.write("meta/core/profile-schema.md", schema);
      await app.vault.createBinary(`${folder}/picture.png`, new Uint8Array(bytes).buffer);
      const file = app.vault.getAbstractFileByPath(note);
      const text = (await app.vault.read(file)) as string;
      await app.vault.modify(file, text.replace("\n---\n", "\nimage: picture.png\n---\n"));
    }, [SCHEMA, PROFILE, FOLDER, PNG]);
    await openNote(ui, PROFILE);
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to pass with a picture in the vault", "none");

    // The editor draws it where the name stands: the file's own bytes, arrived, with the name
    // as its text.
    const drawn = await ui.waitFor("the picture to be drawn at the H1", () => {
      const img = document.querySelector<HTMLImageElement>(".cm-content .companygraph-picture");
      return img && img.complete && img.naturalWidth > 0
        ? { natural: img.naturalWidth, width: img.getBoundingClientRect().width, alt: img.alt, inHeading: !!img.closest(".HyperMD-header-1") }
        : null;
    });
    assert.deepEqual(drawn, { natural: 256, width: 48, alt: "Robert Blust", inHeading: true });
    if (process.env.E2E_SHOT) await ui.screenshot(process.env.E2E_SHOT);

    await ui.evaluate(async (note: string, folder: string) => {
      const picture = app.vault.getAbstractFileByPath(`${folder}/picture.png`);
      await app.vault.rename(picture, `${folder}/picture.jpg`);
      const file = app.vault.getAbstractFileByPath(note);
      await app.vault.modify(file, ((await app.vault.read(file)) as string).replace("image: picture.png", "image: picture.jpg"));
    }, [PROFILE, FOLDER]);
    // The rename and the note's edit are two writes, and a rebuild between them reports the
    // half-made state, so what is waited for is the one failure the finished state has.
    await command(ui, "check-now");
    await command(ui, "open-checks");
    const said = await ui.waitFor("the pane to say what the picture is", () => {
      const text = (app.workspace.getLeavesOfType("companygraph-checks")[0]?.view.contentEl as HTMLElement | undefined)?.innerText ?? "";
      return /named as/.test(text) ? text : null;
    });
    assert.match(said, /is a PNG named as a JPEG/);
    assert.doesNotMatch(said, /read as text/);

    // README says a click on a picture's failure opens the picture.
    await ui.click(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>("li.companygraph-open"));
      return rows.find((r) => r.innerText.includes("picture.jpg")) ?? rows[0];
    });
    await ui.waitFor("the picture to be the active file", (want: string) =>
      app.workspace.getActiveFile()?.path === want ? true : null, [`${FOLDER}/picture.jpg`]);
  });
});
