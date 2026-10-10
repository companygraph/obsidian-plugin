// The meta-model's `init` and `upgrade` as a person runs them from the command palette: moving the
// reference instance's core to the release this build carries, then clearing the instance out of
// the vault's copy and making a new one, and the checks running over what was written.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { clearNotices, command, intoField, modalText, noModal, onDisk, pressButton, shownInPlan, waitForChecks, waitForModal, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const MANIFEST = ".companygraph/manifest.json";
// A vault whose manifest records none of the tooling's skills, and which keeps skills of its own
// under the names the tooling writes, wrote them itself: a move must leave them as they are. The
// reference instance has since taken the tooling's skills, and its manifest records them, so the
// test makes the copy that vault: no skill recorded, and the validate skill its own text.
const OWN_SKILL = ".claude/skills/companygraph-validate/SKILL.md";

describe("making an instance and moving its core", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Move this vault's core says what it will write, moves the pins, and leaves the vault's own skills", async () => {
    const { ui } = session;
    // The fixture may be on the core this build carries, and a vault on it has nothing to move, or
    // a core or two behind it. Either way the copy is set back to an older release, as that release
    // left an instance: the manifest and the workflow name 0.46.1 and core 0.40.0, and the kpi
    // schema 0.41.0 added is not there, on disk or in the manifest.
    await ui.evaluate(async (manifest: string, skill: string) => {
      const was = JSON.parse(await app.vault.adapter.read(manifest));
      was.tooling = "0.46.1";
      was.core.version = "0.40.0";
      delete was.files["meta/core/kpi-schema.md"];
      for (const path of Object.keys(was.files)) if (path.startsWith(".claude/skills/")) delete was.files[path];
      await app.vault.adapter.write(skill, "---\nname: companygraph-validate\ndescription: This vault's own way of validating.\n---\n\nRun the vault's own checks.\n");
      await app.vault.adapter.write(manifest, `${JSON.stringify(was, null, 2)}\n`);
      await app.vault.adapter.remove("meta/core/kpi-schema.md");
      const workflow = ".github/workflows/companygraph.yml";
      await app.vault.adapter.write(workflow, (await app.vault.adapter.read(workflow)).replace(/instance-check\.yml@v[0-9.]+/, "instance-check.yml@v0.46.1"));
    }, [MANIFEST, OWN_SKILL]);
    // And the model as that release left it: the localization page in the form before one language
    // per model, and the seats where core kept them before core 0.63.0 named the type, as
    // `model/roles/`, a profile's `roles` and an experience's `role`.
    await ui.evaluate(async () => {
      const adapter = app.vault.adapter;
      const localization = "model/localization.md";
      const page = await adapter.read(localization);
      await adapter.write(localization, `${page.match(/^---\n[^]*?\n(?=locale:)/)![0]}---\n\n# Languages\n\n> ${page.match(/^> (.*)$/m)![1]}\n\n## Locales\n\n| Locale | Role |\n| --- | --- |\n| en-US | primary |\n`);
      await adapter.mkdir("model/roles");
      for (const file of (await adapter.list("model/seats")).files) {
        const text = await adapter.read(file);
        await adapter.write(file.replace("model/seats/", "model/roles/"), file.endsWith("README.md") ? text.replace(/^# Seats$/m, "# Roles") : text);
        await adapter.remove(file);
      }
      await adapter.rmdir("model/seats", true);
      const walk = async (folder: string): Promise<void> => {
        const listed = await adapter.list(folder);
        for (const file of listed.files.filter((f: string) => f.endsWith(".md"))) {
          const text = await adapter.read(file);
          const before = file.includes("/experiences/") ? text.replace(/^capacity:/m, "role:") : text.replace(/^seats:/m, "roles:");
          if (before !== text) await adapter.write(file, before);
        }
        for (const child of listed.folders) await walk(child);
      };
      await walk("model/profiles");
    });
    const own = await onDisk(ui, OWN_SKILL);
    const before = JSON.parse((await onDisk(ui, MANIFEST))!);
    await command(ui, "move-core");
    await waitForModal(ui, "Move this vault's core");
    await ui.waitFor("the plan to be shown", () => /Core .* → /.test(document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "") || null);
    const shown = await modalText(ui);
    assert.match(shown, /\.companygraph\/manifest\.json/);
    assert.match(shown, /Core 0\.40\.0 → /);
    assert.match(shown, shownInPlan("meta/core/kpi-schema.md"));
    // The reference instance's localization page is in the form before one language per model, so
    // the move rewrites it, and the plan says so rather than that the model is not touched.
    assert.match(shown, /model\/localization\.md\b.* (?:is|are) rewritten into the form core [0-9.]+ reads\./);
    assert.doesNotMatch(shown, /The model is not touched/);
    // The seats move from the folder core kept them in, and the plan says so, and what it leaves
    // the owner: their own files that still say roles.
    assert.match(shown, /Moves model\/roles\/ to model\/seats\/ \(\d+\)\./);
    assert.match(shown, /The files in model\/roles\/ move to model\/seats\/, each page keeping its id, and model\/roles\/ goes to the trash once it is empty\./);
    assert.match(shown, /model\/seats\/README\.md has its heading, folder and schema path changed/);
    // They are named, not exemplified: the reference instance's own docs that still say roles.
    assert.match(shown, /Files of your own that still say roles: (?:[^,.]*, )*docs\/[^,.]*\.md(?:, [^,]*)*\. They are yours to edit/);
    assert.doesNotMatch(shown, /such as README\.md/);
    await pressButton(ui, "Move it");
    await noModal(ui);
    await waitForNotice(ui, "^Core .*, \\d+ moved: model/roles/ to model/seats/ \\(\\d+\\)");
    const after = JSON.parse((await onDisk(ui, MANIFEST))!);
    assert.notEqual(after.tooling, before.tooling, "the manifest names this build's release");
    assert.ok(await onDisk(ui, "model/seats/owner.md"), "the move carried the owner's seat across");
    assert.equal(await onDisk(ui, "model/roles/owner.md"), null, "nothing is left of it in model/roles/");
    assert.equal(await ui.evaluate(() => app.vault.adapter.exists("model/roles")), false, "the folder the move emptied is gone");
    assert.match((await onDisk(ui, "model/profiles/robert-blust/robert-blust.md"))!, /^seats:\n {2}- Owner$/m);
    // The plan shows the kpi schema inside its folder's count; that the move wrote it is read here.
    assert.ok(await onDisk(ui, "meta/core/kpi-schema.md"), "the move wrote the kpi schema");
    assert.ok(after.files["meta/core/kpi-schema.md"], "the manifest records the kpi schema");
    assert.match((await onDisk(ui, ".github/workflows/companygraph.yml"))!, new RegExp(`instance-check\\.yml@v${after.tooling.replace(/\./g, "\\.")}`));
    assert.equal(await onDisk(ui, OWN_SKILL), own, "a skill the manifest never recorded is the vault's own");
    await waitForChecks(ui, "the moved instance to be checked", "none");
  });

  test("Make this vault an instance refuses where one is, and writes one the checks pass where none is", async () => {
    const { ui } = session;
    await clearNotices(ui);
    await command(ui, "make-instance");
    await waitForModal(ui, "Make this vault an instance");
    await pressButton(ui, "Make it an instance");
    await waitForNotice(ui, "already");
    await ui.press("Escape");
    await noModal(ui);

    // The vault's copy, cleared of the instance: what init writes, and what the reference
    // instance keeps beside it that init would also write.
    await ui.evaluate(async () => {
      for (const folder of [".companygraph", "meta", "model", ".claude", ".github"])
        if (await app.vault.adapter.exists(folder)) await app.vault.adapter.rmdir(folder, true);
      for (const file of ["AGENTS.md", "CLAUDE.md"]) if (await app.vault.adapter.exists(file)) await app.vault.adapter.remove(file);
    });
    await clearNotices(ui);
    await command(ui, "make-instance");
    await waitForModal(ui, "Make this vault an instance");
    await intoField(ui, "Name");
    await ui.evaluate(() => { const input = document.activeElement as HTMLInputElement; input.select(); });
    await ui.type("Acme");
    // A company with no people in it: the folders for people are left out.
    for (const folder of ["profiles", "skills"])
      await ui.click((name: string) => Array.from(document.querySelectorAll<HTMLElement>(".modal .setting-item"))
        .find((s) => s.querySelector<HTMLElement>(".setting-item-name")?.innerText.trim() === name)?.querySelector(".checkbox-container"), [folder]);
    await pressButton(ui, "Make it an instance");
    await noModal(ui);
    await waitForNotice(ui, "files written");

    const manifest = JSON.parse((await onDisk(ui, MANIFEST))!);
    assert.equal(manifest.core.source, "bundled");
    // Hashed inside Obsidian by the plugin's own sha256, which stands in for node:crypto there:
    // every one must be what Node computes over the bytes on disk.
    for (const [file, hash] of Object.entries(manifest.files as Record<string, string>))
      assert.equal(`sha256:${createHash("sha256").update((await onDisk(ui, file))!).digest("hex")}`, hash, file);
    assert.match((await onDisk(ui, "model/identity.md"))!, /\n# Acme\n/);
    // The brand is the third singular the package's starting entities write, named as the identity is.
    assert.match((await onDisk(ui, "model/brand.md"))!, /\n# Acme\n[\s\S]*\n## Voice\n/);
    assert.ok(await onDisk(ui, ".claude/skills/companygraph-export/build.py"));
    assert.equal(await onDisk(ui, "model/profiles/README.md"), null);
    assert.match((await onDisk(ui, "model/values/README.md"))!, /`meta\/core\/value-schema\.md`/);
    await waitForChecks(ui, "the new instance to be checked", "none");
  });
});
