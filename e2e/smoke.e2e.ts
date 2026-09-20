// The harness itself: Obsidian starts on a copy of the pinned instance, the plugin reads it, a
// real click lands, a wait that runs out says what it waited for, and the live vault is not it.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the harness", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  after(async () => { await session?.stop(); });

  test("the plugin has read the copy of the pinned instance, and no other vault", async () => {
    const seen = await session.ui.evaluate(() => ({
      files: app.plugins.plugins.companygraph.files.size,
      base: app.vault.adapter.basePath,
    }));
    assert.ok(seen.files > 0, "the plugin read files");
    assert.equal(seen.base, session.vault);
    assert.ok(!seen.base.includes("/git/"), "a temporary folder, not a clone");
  });

  test("a real click lands on what it was aimed at", async () => {
    await session.ui.evaluate(() => {
      const button = document.body.createEl("button", { text: "aim", attr: { id: "e2e-aim" } });
      button.style.cssText = "position:fixed;top:40%;left:40%;z-index:9999";
      button.addEventListener("mousedown", () => button.setAttribute("data-down", "1"));
      button.addEventListener("click", () => button.setAttribute("data-clicked", "1"));
    });
    await session.ui.click("#e2e-aim");
    const got = await session.ui.waitFor("the button to have been pressed and clicked", () => {
      const b = document.getElementById("e2e-aim");
      return b?.getAttribute("data-down") === "1" && b.getAttribute("data-clicked") === "1";
    });
    assert.equal(got, true);
    await session.ui.evaluate(() => document.getElementById("e2e-aim")?.remove());
  });

  test("a wait that runs out says what it was waiting for", async () => {
    await assert.rejects(
      session.ui.waitFor("a thing that never comes", () => false, [], 300),
      /waited 300 ms for a thing that never comes/,
    );
  });

  test("what must not happen is watched for its window, and caught when it does", async () => {
    await session.ui.never("nothing", () => false, [], 300);
    await assert.rejects(session.ui.never("the sky to fall", () => true, [], 300), /the sky to fall/);
  });
});
