// One Obsidian per test file, on a copy of the pinned reference instance (spec §4). A user-data
// folder of its own gets past Obsidian's single-instance lock, so the owner's window and vault
// are never touched, and the application is ended by its handle, never by name.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { connect } from "./cdp.ts";
import type { Connection } from "./cdp.ts";
import type { Driver } from "./driver.ts";

const ROOT = path.join(import.meta.dirname, "..");
const FIXTURE = path.join(ROOT, "test", "fixtures", "mental-model");
const DEFAULT_BIN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
// Where the plugin's three files are taken from: the working tree, or a folder holding a
// release's assets, which is how a test is shown to fail on the release it guards against.
const PLUGIN = process.env.E2E_PLUGIN_DIR ?? ROOT;
const SHOTS = path.join(ROOT, "e2e", "failures");
// With E2E_COVERAGE set, what ran of the plugin is written here, one file for each test file, for
// scripts/e2e-coverage.mjs to read.
const COVERAGE = process.env.E2E_COVERAGE ? path.join(ROOT, "e2e", "coverage") : null;

export interface Session {
  // The driver: what a test does and sees. Not called `app`, which inside a page function is
  // Obsidian's own global.
  ui: Driver;
  vault: string;
  // Puts these notes back as the fixture has them, in the file and in Obsidian's editor alike.
  restore(paths: string[]): Promise<void>;
  // A screenshot and the page's errors beside a failing test's name.
  record(name: string): Promise<void>;
  stop(): Promise<void>;
}

// The binary, or null where there is none; a suite asks before it starts and skips on null.
export function available(): string | null {
  const bin = process.env.OBSIDIAN_BIN ?? DEFAULT_BIN;
  return fs.existsSync(bin) && fs.existsSync(path.join(FIXTURE, ".companygraph")) ? bin : null;
}

const freePort = () => new Promise<number>((done, fail) => {
  const server = net.createServer();
  server.once("error", fail);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as net.AddressInfo;
    server.close(() => done(port));
  });
});

export async function start(): Promise<Session> {
  const bin = available();
  if (!bin) throw new Error("Obsidian or the fixture is missing; ask available() first");
  // realpath: macOS hands out /var/… and Obsidian reports /private/var/….
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "companygraph-e2e-")));
  const vault = path.join(home, "vault");
  const userData = path.join(home, "user-data");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  const plugin = path.join(vault, ".obsidian", "plugins", "companygraph");
  fs.mkdirSync(plugin, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(PLUGIN, file), path.join(plugin, file));
  fs.writeFileSync(path.join(vault, ".obsidian", "community-plugins.json"), '["companygraph"]\n');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, "obsidian.json"), JSON.stringify({ vaults: { e2e0000000000000: { path: vault, ts: Date.now(), open: true } } }));

  const port = await freePort();
  const child: ChildProcess = spawn(bin, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], { stdio: "ignore" });
  const ended = new Promise<void>((done) => child.once("exit", () => done()));
  const stop = async (ui?: Driver, connection?: Connection) => {
    if (COVERAGE && connection) {
      const ran = await connection.coverage().catch(() => null);
      fs.mkdirSync(COVERAGE, { recursive: true });
      if (ran) fs.writeFileSync(path.join(COVERAGE, `${path.basename(process.argv[1] ?? "run")}.json`), JSON.stringify(ran));
    }
    await ui?.close().catch(() => {});
    child.kill();
    await ended;
    fs.rmSync(home, { recursive: true, force: true });
  };

  let ui: Driver;
  let connection: Connection;
  try {
    connection = await connect(port, COVERAGE !== null);
    ui = connection.ui;
    // A vault opened for the first time asks whether its plugins are trusted.
    await ui.waitFor("the plugin to have read the vault", () => {
      for (const button of Array.from(document.querySelectorAll<HTMLElement>(".modal button")))
        if (/trust/i.test(button.innerText)) button.click();
      // Early in the page's life Obsidian's global is not there yet, and a bare `app` would throw.
      const plugin = (window as unknown as { app?: typeof app }).app?.plugins?.plugins?.companygraph;
      return Boolean(plugin?.layout && plugin.files?.size > 0);
    }, [], 30000);
    await ui.evaluate(() => { app.setting?.close?.(); });
  } catch (failure) {
    await stop();
    throw failure;
  }

  return {
    ui, vault,
    async restore(paths) {
      for (const note of paths) {
        const text = fs.readFileSync(path.join(FIXTURE, note), "utf8");
        // Through Obsidian and not under it: a note open in an editor is the editor's to write,
        // and a file changed behind it may be written over a moment later.
        await ui.evaluate(async (at: string, as: string) => {
          const file = app.vault.getAbstractFileByPath(at);
          if (file && (await app.vault.read(file)) !== as) await app.vault.modify(file, as);
        }, [note, text]);
        await ui.waitFor(`${note} to be as the fixture has it`, async (at: string, as: string) => {
          const plugin = app.plugins.plugins.companygraph;
          return (await app.vault.adapter.read(at)) === as && plugin.files.get(at) === as;
        }, [note, text]);
      }
    },
    async record(name) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const base = path.join(SHOTS, name.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
      await ui.screenshot(`${base}.png`).catch(() => {});
      fs.writeFileSync(`${base}.txt`, (await ui.errors().catch(() => [])).join("\n"));
    },
    stop: () => stop(ui, connection),
  };
}
