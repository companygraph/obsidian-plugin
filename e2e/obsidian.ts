// One Obsidian per test file, on a copy of the pinned reference instance (spec §4). A user-data
// folder of its own gets past Obsidian's single-instance lock, so the owner's window and vault
// are never touched, and the application is ended by its handle, never by name.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { place, readLocal } from "companygraph-meta-model/obsidian";
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
  // The window loaded again, as Reload app without saving does it, and the plugin ready after.
  reload(): Promise<void>;
  stop(): Promise<void>;
}

// Which Obsidian to run. With E2E_OBSIDIAN_VERSION set, "latest" or a version's number, the
// application is downloaded and started by obsidian-launcher, which is how the suite runs where
// Obsidian is not installed, a CI runner, and against a release other than the installed one;
// E2E_OBSIDIAN_INSTALLER picks the installer, "latest" or "earliest", the oldest that release
// runs on. Without it the installed application is used, at OBSIDIAN_BIN or where macOS puts it.
const VERSION = process.env.E2E_OBSIDIAN_VERSION ?? "";
const INSTALLER = process.env.E2E_OBSIDIAN_INSTALLER ?? "latest";

// What will be run, or null where there is nothing to run; a suite asks before it starts and
// skips on null.
export function available(): string | null {
  if (!fs.existsSync(path.join(FIXTURE, ".companygraph"))) return null;
  if (VERSION) return `Obsidian ${VERSION} from obsidian-launcher`;
  const bin = process.env.OBSIDIAN_BIN ?? DEFAULT_BIN;
  return fs.existsSync(bin) ? bin : null;
}

const freePort = () => new Promise<number>((done, fail) => {
  const server = net.createServer();
  server.once("error", fail);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as net.AddressInfo;
    server.close(() => done(port));
  });
});

// `workspace` is a `.obsidian/workspace.json` put into the copy before Obsidian starts, as the
// tooling puts one into a vault it makes: the one way to open a vault whose layout came before
// its plugins, which is where a tab restored before its view is registered shows.
export async function start({ workspace }: { workspace?: string } = {}): Promise<Session> {
  const bin = available();
  if (!bin) throw new Error("Obsidian or the fixture is missing; ask available() first");
  // realpath: macOS hands out /var/… and Obsidian reports /private/var/….
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "companygraph-e2e-")));
  const vault = path.join(home, "vault");
  const userData = path.join(home, "user-data");
  fs.cpSync(FIXTURE, vault, { recursive: true });
  // Put in as the tooling's `obsidian --from` puts a build in, so the plugin loading below is also
  // the proof that what that command writes is what Obsidian switches on.
  place(vault, readLocal(PLUGIN));
  if (workspace !== undefined) fs.writeFileSync(path.join(vault, ".obsidian", "workspace.json"), workspace);
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, "obsidian.json"), JSON.stringify({ vaults: { e2e0000000000000: { path: vault, ts: Date.now(), open: true } } }));

  const port = await freePort();
  let child: ChildProcess;
  if (VERSION) {
    // The launcher makes a user-data folder of its own, with the vault named in it and trusted,
    // and starts the release asked for; the vault's copy and the plugin in it stay this file's.
    const { default: ObsidianLauncher } = await import("obsidian-launcher");
    const launched = await new ObsidianLauncher().launch({
      appVersion: VERSION, installerVersion: INSTALLER, vault, copy: false,
      args: [`--remote-debugging-port=${port}`], spawnOptions: { stdio: "ignore" },
    });
    child = launched.proc;
  } else {
    child = spawn(bin, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], { stdio: "ignore" });
  }
  const ended = new Promise<void>((done) => child.once("exit", () => done()));
  // What ran before each reload a test asked for: a window loaded again evaluates the plugin's
  // script anew, and what the evaluation before it ran is not always still there to be asked for
  // at the end. Seen: the settings tab's own drawing counted as never run.
  const earlier: NonNullable<Awaited<ReturnType<Connection["coverage"]>>>[] = [];
  const stop = async (ui?: Driver, connection?: Connection) => {
    if (COVERAGE && connection) {
      const ran = await connection.coverage().catch(() => null);
      fs.mkdirSync(COVERAGE, { recursive: true });
      if (ran) fs.writeFileSync(path.join(COVERAGE, `${path.basename(process.argv[1] ?? "run")}.json`),
        JSON.stringify({ source: ran.source, evaluations: [...earlier.flatMap((e) => e.evaluations), ...ran.evaluations] }));
    }
    await ui?.close().catch(() => {});
    child.kill();
    // And harder if it will not go. A release old enough sits through a polite signal, and the
    // wait for it to end never returned: one test file's failure hung the whole run, and the
    // temporary folder outlived it. Measured against Obsidian 1.5.3.
    const forced = setTimeout(() => child.kill("SIGKILL"), 5000);
    await ended;
    clearTimeout(forced);
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
        // And asked again until it holds: an editor with an edit of its own in hand merges what
        // is written under it and saves the merge a moment later, a Properties row being typed
        // into writes the frontmatter back, and either leaves a note that is not the fixture's.
        await ui.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); });
        await ui.waitFor(`${note} to be as the fixture has it`, async (at: string, as: string) => {
          const file = app.vault.getAbstractFileByPath(at);
          if (!file) return false;
          if ((await app.vault.read(file)) !== as) {
            await app.vault.modify(file, as);
            return false;
          }
          let held = true;
          app.workspace.iterateAllLeaves((leaf: { view: { file?: { path: string }; editor?: { getValue(): string } } }) => {
            if (leaf.view.file?.path === at && leaf.view.editor && leaf.view.editor.getValue() !== as) held = false;
          });
          return held && app.plugins.plugins.companygraph.files.get(at) === as;
        }, [note, text]);
      }
    },
    async record(name) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const base = path.join(SHOTS, name.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
      await ui.screenshot(`${base}.png`).catch(() => {});
      fs.writeFileSync(`${base}.txt`, (await ui.errors().catch(() => [])).join("\n"));
    },
    async reload() {
      if (COVERAGE) {
        const ran = await connection.coverage().catch(() => null);
        if (ran) earlier.push(ran);
      }
      await ui.evaluate(() => { (window as unknown as { __e2eLeaving?: boolean }).__e2eLeaving = true; window.setTimeout(() => location.reload(), 0); });
      // While the page goes and comes back there is no page to ask, and asking throws; that is
      // not the plugin failing to come back, so it is asked again until the deadline.
      const deadline = Date.now() + 30000;
      for (;;) {
        try {
          await ui.waitFor("the plugin to have read the vault after a reload", () => {
            const plugin = (window as unknown as { app?: typeof app }).app?.plugins?.plugins?.companygraph;
            return Boolean(plugin?.layout && plugin.files?.size > 0 && !(window as unknown as { __e2eLeaving?: boolean }).__e2eLeaving);
          }, [], 2000);
          return;
        } catch (failure) {
          if (Date.now() > deadline) throw failure;
        }
      }
    },
    stop: () => stop(ui, connection),
  };
}
