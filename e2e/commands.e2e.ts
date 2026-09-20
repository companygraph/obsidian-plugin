// Every command the plugin registers has a test that runs it. The commands are read from the
// running plugin and not listed here, so a command added without a test is a failing run and
// not a gap nobody sees (spec §6). A test runs a command through `command(ui, "<id>")`, or names
// it as Obsidian does, `companygraph:<id>`; this reads the suite's own files for both.
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the plugin's commands", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  after(async () => { await session?.stop(); });

  test("each has a test that runs it", async () => {
    const registered = await session.ui.evaluate(() => Object.keys(app.commands.commands).filter((id) => id.startsWith("companygraph:")).map((id) => id.slice("companygraph:".length)).sort());
    assert.ok(registered.length > 0, "the plugin registers commands");
    const here = import.meta.dirname;
    const run = new Set<string>();
    for (const file of fs.readdirSync(here).filter((f) => f.endsWith(".e2e.ts") && f !== path.basename(import.meta.filename))) {
      const text = fs.readFileSync(path.join(here, file), "utf8");
      for (const m of text.matchAll(/command\(ui, "([a-z-]+)"\)|companygraph:([a-z-]+)/g)) run.add(m[1] ?? m[2]);
    }
    assert.deepEqual(registered.filter((id) => !run.has(id)), [], "commands no test runs");
  });
});
