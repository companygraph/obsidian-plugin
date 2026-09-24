// Open the command line as a person runs it from the command palette: not offered in a vault
// without the Terminal plugin, and in one with it, a terminal of Terminal's own at the vault's
// root whose shell was handed the meta-model's command line. Terminal has no API for this, so the
// test is also what says when a release of it no longer reads the state the plugin hands it.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { command } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the command line without the Terminal plugin", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  after(async () => { await session?.stop(); });

  test("Open the command line is not offered", async () => {
    // What the palette asks before it lists a command.
    const offered = await session.ui.evaluate(() => app.commands.findCommand("companygraph:open-cli")?.checkCallback?.(true) as boolean);
    assert.equal(offered, false);
  });
});

describe("the command line in a terminal", { skip }, () => {
  let session: Session;
  before(async () => { session = await start({ terminal: true }); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("Open the command line opens a terminal at the vault's root that runs the bundled release", async () => {
    const { ui, vault } = session;
    await ui.waitFor("Terminal to be switched on", () => Boolean(app.plugins.plugins.terminal) || null);
    assert.equal(await command(ui, "open-cli"), true);
    const opened = await ui.waitFor("a terminal to be open", () => {
      const leaf = app.workspace.getLeavesOfType("terminal:terminal")[0];
      if (!leaf) return null;
      const state = leaf.view.getState()["terminal:terminal"] ?? {};
      return { cwd: state.cwd, args: state.profile?.args ?? [], active: app.workspace.getActiveViewOfType?.(leaf.view.constructor) === leaf.view };
    });
    assert.equal(opened.cwd, vault);
    assert.match(opened.args.at(-1) ?? "", /^npx --yes github:companygraph\/meta-model#v\d+\.\d+\.\d+; exec /);
    assert.ok(opened.active, "the terminal is the tab in front");
    // Terminal says so in the pane where it cannot start a profile; a shell that started says nothing of the kind.
    const said = await ui.evaluate(() => (app.workspace.getLeavesOfType("terminal:terminal")[0]?.view.containerEl.innerText ?? "") as string);
    assert.doesNotMatch(said, /unsupported profile/i);
  });
});
