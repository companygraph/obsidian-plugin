// The meta-model's `init` and `upgrade` as a person runs them from the command palette: moving the
// reference instance's core to the release this build carries, then clearing the instance out of
// the vault's copy and making a new one, and the checks running over what was written.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { clearNotices, command, intoField, modalText, noModal, onDisk, pressButton, waitForChecks, waitForModal, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const MANIFEST = ".companygraph/manifest.json";
// The reference instance keeps skills of its own under the names the tooling writes, and its
// manifest records none of them: a move must leave them as they are.
const OWN_SKILL = ".claude/skills/companygraph-validate/SKILL.md";

describe("making an instance and moving its core", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Move this vault's core says what it will write, moves the pins, and leaves the vault's own skills", async () => {
    const { ui } = session;
    // The fixture is already on the core this build carries, and a vault on it has nothing to
    // move. The copy is set back to the release before it, as that release left an instance: the
    // manifest and the workflow name 0.46.1 and core 0.40.0, and the kpi schema 0.41.0 added is
    // not there, on disk or in the manifest.
    await ui.evaluate(async (manifest: string) => {
      const was = JSON.parse(await app.vault.adapter.read(manifest));
      was.tooling = "0.46.1";
      was.core.version = "0.40.0";
      delete was.files["meta/core/kpi-schema.md"];
      await app.vault.adapter.write(manifest, `${JSON.stringify(was, null, 2)}\n`);
      await app.vault.adapter.remove("meta/core/kpi-schema.md");
      const workflow = ".github/workflows/companygraph.yml";
      await app.vault.adapter.write(workflow, (await app.vault.adapter.read(workflow)).replace(/instance-check\.yml@v[0-9.]+/, "instance-check.yml@v0.46.1"));
    }, [MANIFEST]);
    const own = await onDisk(ui, OWN_SKILL);
    const before = JSON.parse((await onDisk(ui, MANIFEST))!);
    await command(ui, "move-core");
    await waitForModal(ui, "Move this vault's core");
    await ui.waitFor("the plan to be shown", () => /Core .* → /.test(document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "") || null);
    const shown = await modalText(ui);
    assert.match(shown, /\.companygraph\/manifest\.json/);
    assert.match(shown, /Core 0\.40\.0 → /);
    assert.match(shown, /meta\/core\/kpi-schema\.md/);
    await pressButton(ui, "Move it");
    await noModal(ui);
    await waitForNotice(ui, "^Core ");
    const after = JSON.parse((await onDisk(ui, MANIFEST))!);
    assert.notEqual(after.tooling, before.tooling, "the manifest names this build's release");
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
