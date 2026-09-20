# The plugin is run in Obsidian — implementation plan, part one

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run e2e` starts Obsidian on a copy of the pinned reference instance, works the plugin with real clicks and keys, and holds the four defects of September 20, 2026.

**Architecture:** A suite under `e2e/`, beside `src/` and `test/`, run by Node's own test runner one file at a time. A test is handed a `Driver` and never imports the transport; the first transport speaks the DevTools protocol over Node's own WebSocket, and a later one answers the same interface through WebdriverIO. `e2e/obsidian.ts` owns everything about starting and ending the application.

**Tech Stack:** TypeScript under Node's type stripping, `node:test`, `node:child_process`, `node:net`, the global `WebSocket` and `fetch`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-20-run-in-obsidian-design.md`. Executors read it before Task 1.

**Scope:** this part builds the harness, the four regression tests of the spec's §6, and the rule changes of its §8. The test for every registered command and the tests of the screen behaviours are part two, written once this part has run ten times and the driver's real shape and the suite's running time are known; the spec's §3 gives the reason, that what these tests need from a driver is not known until a few exist.

**Proven before this plan was written:** every mechanism below ran by hand in a session's scratch folder on 2026-09-20 against Obsidian 1.13.7 on macOS: the separate user-data folder, the debugging port, the page whose address opens `app://`, real mouse and key events through the `Input` domain, and each of the four probes failing on release 0.5.1 and passing on the fix.

## Global Constraints

- No new dependency, in `dependencies` or `devDependencies`.
- `e2e/` is not part of `npm test`, and no workflow runs it.
- A test imports `e2e/driver.ts` for types and `e2e/obsidian.ts` to start a session, and never `e2e/cdp.ts`.
- A test never sleeps a fixed time to let something happen: `waitFor` with a deadline, and `never` with a stated window for what must not happen.
- Clicks and keys are real input events, never `el.click()`.
- The vault is a copy of `test/fixtures/mental-model`; the live vault is never read. No test names a line number of a note: it finds what it needs in the fixture at run time.
- Where Obsidian is not installed the suite is skipped with a message, not failed. `OBSIDIAN_BIN` names the binary; the default is `/Applications/Obsidian.app/Contents/MacOS/Obsidian`.
- The application is ended by its process handle, never by name.
- Type stripping is the runner: no enums, no parameter properties, no namespaces; a relative import names its file with `.ts`; a type is imported with `import type`.
- A function handed to `evaluate`, `waitFor`, `never` or `click` runs in the page: it closes over nothing, and takes what it needs as JSON arguments.
- `conventions/WRITING.md` and `conventions/WORKING.md` apply. A commit is made when the owner asks.

---

### Task 1: The driver, the transport and the session

**Files:**

- Create: `e2e/driver.ts`, `e2e/cdp.ts`, `e2e/obsidian.ts`, `e2e/page.d.ts`, `e2e/smoke.e2e.ts`
- Modify: `package.json` (the `e2e` script), `tsconfig.json` (`include`)

**Interfaces:**

- Produces: `Driver`, `PageFn`, `Modifiers` from `e2e/driver.ts`; `available(): string | null`, `start(): Promise<Session>` and `Session { ui: Driver; vault: string; restore(paths: string[]): Promise<void>; stop(): Promise<void> }` from `e2e/obsidian.ts`.

- [ ] **Step 1: Write the smoke test, which fails for want of the harness**

**File:** `e2e/smoke.e2e.ts`

```ts
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test --test-concurrency=1 'e2e/*.e2e.ts'`
Expected: FAIL, `Cannot find module … e2e/obsidian.ts`.

- [ ] **Step 3: Write the driver's interface**

**File:** `e2e/driver.ts`

```ts
// What a test may ask of Obsidian: what a person at the screen could do or see, and nothing of
// how it is carried there. The first transport is the DevTools protocol (cdp.ts); the target is
// WebdriverIO's `browser` behind the same interface (spec §3), and a test that imports only this
// file moves there unchanged.

// A function that runs in the page, not here: it closes over nothing and takes JSON arguments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PageFn<T> = (...args: any[]) => T | Promise<T>;

export interface Modifiers { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean }

export interface Driver {
  // The function's result, which has to survive JSON.
  evaluate<T>(fn: PageFn<T>, args?: unknown[]): Promise<T>;
  // A real press and release at the middle of an element, scrolled into sight first: a CSS
  // selector, or a function that finds the element. It waits for the element to be there.
  click(target: string | PageFn<Element | null | undefined>, args?: unknown[], modifiers?: Modifiers): Promise<void>;
  // A real key: a letter, or a name as KeyboardEvent.key spells it ("Tab", "End", "Enter").
  press(key: string, modifiers?: Modifiers): Promise<void>;
  // Text as typing puts it in, into whatever holds the focus.
  type(text: string): Promise<void>;
  // Asks until the condition answers something truthy and gives that back. A wait that runs out
  // says what it was waiting for (spec §5).
  waitFor<T>(what: string, condition: PageFn<T>, args?: unknown[], timeout?: number): Promise<NonNullable<T>>;
  // The one thing a condition cannot be: that something does not happen. Watches for `window`
  // milliseconds and fails the moment the condition answers something truthy. An empty list is
  // truthy: a condition that collects what went wrong answers null where nothing did.
  never(what: string, condition: PageFn<unknown>, args: unknown[], window: number): Promise<void>;
  screenshot(file: string): Promise<void>;
  // Errors and unhandled rejections the page has seen since the session began.
  errors(): Promise<string[]>;
  close(): Promise<void>;
}
```

- [ ] **Step 4: Write the transport**

**File:** `e2e/cdp.ts`

```ts
// The Driver over the Chrome DevTools protocol, spoken directly on Node's own WebSocket. Only
// obsidian.ts imports this file.
import fs from "node:fs";
import type { Driver, Modifiers, PageFn } from "./driver.ts";

const EVERY = 100;
const PATIENCE = 15000;
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Named keys, as KeyboardEvent.key spells them, with the virtual key code the protocol wants.
const NAMED: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
};

const bits = (m: Modifiers = {}) => (m.alt ? 1 : 0) | (m.ctrl ? 2 : 0) | (m.meta ? 4 : 0) | (m.shift ? 8 : 0);

// A page function and its arguments as one expression the page can run.
const call = (fn: PageFn<unknown>, args: unknown[] = []) => `(${fn.toString()})(...${JSON.stringify(args)})`;

// What ran, as the protocol reports it: the plugin's script as Obsidian evaluated it, and for
// every function the ranges of it that were and were not executed.
// One list of functions for each time the script was evaluated: a test that loads the window
// again has the plugin's script evaluated again, and what ran counts from every evaluation.
type Functions = { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] }[];
export interface Coverage { source: string; evaluations: Functions[] }
export interface Connection { ui: Driver; coverage(): Promise<Coverage | null> }

export async function connect(port: number, record = false): Promise<Connection> {
  // Obsidian's own window is the page whose address opens app://; a settings window is about:blank.
  let url = "";
  for (let waited = 0; !url; waited += EVERY) {
    if (waited > PATIENCE) throw new Error(`waited ${PATIENCE} ms for Obsidian's window on port ${port}`);
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; url: string; webSocketDebuggerUrl: string }[];
      url = pages.find((p) => p.type === "page" && p.url.startsWith("app://"))?.webSocketDebuggerUrl ?? "";
    } catch {
      // not listening yet
    }
    if (!url) await sleep(EVERY);
  }
  const socket = new WebSocket(url);
  await new Promise((open, fail) => { socket.onopen = open; socket.onerror = fail; });
  let id = 0;
  const waiting = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  };
  const send = <T>(method: string, params: object = {}): Promise<T> =>
    new Promise((done, fail) => {
      waiting.set(++id, (message) => (message.error ? fail(new Error(`${method}: ${message.error.message}`)) : done(message.result as T)));
      socket.send(JSON.stringify({ id, method, params }));
    });

  const run = async <T>(expression: string): Promise<T> => {
    const answer = await send<{ result: { value: T }; exceptionDetails?: { exception?: { description?: string }; text: string } }>(
      "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    return answer.result.value;
  };

  const driver: Driver = {
    evaluate: (fn, args) => run(call(fn, args)),

    async waitFor(what, condition, args, timeout = PATIENCE) {
      for (let waited = 0; ; waited += EVERY) {
        const got = await run<unknown>(call(condition, args));
        if (got) return got as never;
        if (waited >= timeout) throw new Error(`waited ${timeout} ms for ${what}`);
        await sleep(EVERY);
      }
    },

    async never(what, condition, args, window) {
      for (let watched = 0; watched <= window; watched += EVERY) {
        if (await run<unknown>(call(condition, args))) throw new Error(`${what}, ${watched} ms into a window of ${window}`);
        await sleep(EVERY);
      }
    },

    async click(target, args = [], modifiers) {
      const find = typeof target === "string" ? call((selector: string) => document.querySelector(selector), [target]) : call(target, args);
      // Aimed only at what has come to rest: a sidebar sliding open or a note still scrolling
      // moves an element between the look and the press, and the press lands on what was there
      // before. So the middle of the element is given back once two looks in a row agree on it.
      await run("window.__e2eAim = null");
      const at = await driver.waitFor(`something to click, at rest: ${typeof target === "string" ? target : target.name || "a found element"}`,
        // Built here, run there: the finder is spliced in as source.
        new Function(`return (() => { const el = ${find}; if (!el) return null; el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null;
          const now = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; const was = window.__e2eAim; window.__e2eAim = now;
          return was && was.x === now.x && was.y === now.y ? now : null; })()`) as PageFn<{ x: number; y: number } | null>);
      await send("Page.bringToFront");
      const event = { x: at.x, y: at.y, button: "left", clickCount: 1, modifiers: bits(modifiers) };
      await send("Input.dispatchMouseEvent", { ...event, type: "mouseMoved", button: "none" });
      await send("Input.dispatchMouseEvent", { ...event, type: "mousePressed" });
      await send("Input.dispatchMouseEvent", { ...event, type: "mouseReleased" });
    },

    async press(key, modifiers) {
      const named = NAMED[key];
      const letter = key.length === 1 ? key.toUpperCase() : "";
      if (named === undefined && !letter) throw new Error(`press: no key called ${key}`);
      // On macOS the editing chords of a text field are the application menu's, not the page's,
      // and a bare key event never reaches them: Cmd+A typed into a modal's field selected
      // nothing and the next typing landed mid-word. The protocol carries the editing command
      // beside the key for exactly this.
      const editing = modifiers?.meta && !modifiers.shift ? { a: "selectAll", c: "copy", v: "paste", x: "cut", z: "undo" }[key.toLowerCase()] : undefined;
      const event = {
        key, code: named === undefined ? `Key${letter}` : key,
        windowsVirtualKeyCode: named ?? letter.charCodeAt(0), modifiers: bits(modifiers),
        commands: editing ? [editing] : [],
      };
      await send("Page.bringToFront");
      await send("Input.dispatchKeyEvent", { ...event, type: "rawKeyDown" });
      await send("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
    },

    async type(text) {
      await send("Page.bringToFront");
      await send("Input.insertText", { text });
    },

    async screenshot(file) {
      const shot = await send<{ data: string }>("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    },

    errors: () => run<string[]>("window.__e2eErrors ?? []"),

    async close() { socket.close(); },
  };

  const collector = `(() => { window.__e2eErrors = [];
    window.addEventListener("error", (e) => window.__e2eErrors.push(String(e.message)));
    window.addEventListener("unhandledrejection", (e) => window.__e2eErrors.push("rejection: " + String(e.reason?.stack ?? e.reason).slice(0, 400))); })()`;
  await run(collector);
  if (record) {
    // Coverage counts what runs after it is switched on, and the plugin has loaded by the time
    // anything can connect, so the page is loaded again with the recording already running:
    // what the plugin does as it loads is then counted like everything after it.
    await send("Profiler.enable");
    await send("Profiler.startPreciseCoverage", { callCount: false, detailed: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: collector });
    await send("Page.reload");
    for (let waited = 0; ; waited += EVERY) {
      if (waited > PATIENCE) throw new Error(`waited ${PATIENCE} ms for Obsidian to load again under coverage`);
      await sleep(EVERY);
      if (await run<boolean>(`document.readyState === "complete" && typeof app !== "undefined"`).catch(() => false)) break;
    }
  }
  await send("Page.bringToFront");
  return {
    ui: driver,
    async coverage() {
      if (!record) return null;
      const taken = await send<{ result: { scriptId: string; url: string; functions: Functions }[] }>("Profiler.takePreciseCoverage");
      const scripts = taken.result.filter((entry) => entry.url.includes("plugin:companygraph"));
      if (!scripts.length) return null;
      await send("Debugger.enable");
      // The newest evaluation's source is the one that can still be asked for.
      const { scriptSource } = await send<{ scriptSource: string }>("Debugger.getScriptSource", { scriptId: scripts[scripts.length - 1].scriptId });
      return { source: scriptSource, evaluations: scripts.map((script) => script.functions) };
    },
  };
}
```

- [ ] **Step 5: Write the session: the vault's copy, the application's start and its end**

**File:** `e2e/page.d.ts`

```ts
// Inside a page function `app` is Obsidian's own global, reached the way the developer console
// reaches it. It is untyped on purpose: what a test reads there is read from the running
// application, which is the thing under test, not from a declaration that could drift from it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const app: any;
```

**File:** `e2e/obsidian.ts`

```ts
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
  // The window loaded again, as Reload app without saving does it, and the plugin ready after.
  reload(): Promise<void>;
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
```

- [ ] **Step 6: Wire the script and the type check**

In `package.json`, after the `test` script:

```json
    "e2e": "node scripts/fixtures.mjs && node esbuild.config.mjs && node --test --test-concurrency=1 'e2e/*.e2e.ts'",
```

In `tsconfig.json`: `"include": ["src", "test", "e2e"]`. In `.gitignore`, a line `e2e/failures/`.

- [ ] **Step 7: Run it and see it pass**

Run: `npm run e2e`
Expected: an Obsidian window opens and closes; four tests pass. Then `npm run typecheck`, `npm test`, `sh conventions/conventions-check`, `sh conventions/conventions-format`: all exit 0. With `OBSIDIAN_BIN=/nowhere npm run e2e` the suite reports itself skipped and exits 0.

---

### Task 2: What the four tests share

**Files:**

- Create: `e2e/notes.ts`

**Interfaces:**

- Consumes: `Driver` from Task 1.
- Produces: `PROFILE`, `openNote(ui, path)`, `mentionsOf(ui, target)`, `tablesOf(text)`, `focused(ui)` and the page functions `focusedCell`, `editorText`, as written below.

- [ ] **Step 1: Write the shared reads**

**File:** `e2e/notes.ts`

```ts
// What more than one test reads: the fixture's long note, a note brought to the front, the
// mentions of an entity as the plugin finds them, and the cell that holds the focus.
import type { Driver } from "./driver.ts";

// The reference instance's profile: the note with the long tables every defect of §1 needed.
export const PROFILE = "model/profiles/robert-blust/robert-blust.md";

export interface Mention { path: string; line: number; name: string; declared: string }
export interface Cell { text: string; col: number; row: number; rowTexts: string[]; inSight: boolean; ref: boolean; unresolved: boolean; path: string | null; shadow: string; fill: string }

export async function openNote(ui: Driver, note: string) {
  await ui.evaluate(async (at: string) => {
    const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(false);
    await leaf.openFile(app.vault.getAbstractFileByPath(at), { active: true });
    app.workspace.setActiveLeaf(leaf, { focus: true });
  }, [note]);
  await ui.waitFor(`${note} to be in front`, (at: string) => {
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
    return view?.file?.path === at && view.getMode() === "source" && view.editor.getValue().length > 0;
  }, [note]);
}

// Every name written elsewhere that resolves to `target`, in the order the references pane lists them.
export const mentionsOf = (ui: Driver, target: string) =>
  ui.evaluate((at: string) => {
    const out: { path: string; line: number; name: string; declared: string }[] = [];
    for (const group of app.plugins.plugins.companygraph.referencesAt(at)?.in ?? [])
      for (const m of group.mentions) out.push({ path: m.path, line: m.line, name: m.name, declared: m.declared });
    return out;
  }, [target]) as Promise<Mention[]>;

// The tables of a note as runs of lines that open with a pipe: first line, last line, header cells.
export function tablesOf(text: string): { first: number; last: number; header: string[] }[] {
  const lines = text.split("\n");
  const out: { first: number; last: number; header: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const first = i;
    while (i + 1 < lines.length && lines[i + 1].startsWith("|")) i++;
    out.push({ first, last: i, header: lines[first].split("|").slice(1, -1).map((c) => c.trim()) });
  }
  return out;
}

export const paddedLines = (text: string) => text.split("\n").filter((line) => line.startsWith("|") && / {2,}\|/.test(line)).length;

// The cell of a drawn table that holds the focus, or null. Runs in the page.
export function focusedCell() {
  const td = document.activeElement?.closest?.(".cm-table-widget td, .cm-table-widget th") as HTMLTableCellElement | null;
  const tr = td?.closest("tr");
  const table = td?.closest("table");
  if (!td || !tr || !table) return null;
  const rect = td.getBoundingClientRect();
  const style = getComputedStyle(td);
  // While a cell is edited it holds its drawn text, hidden, and its own editor: the editor is
  // what a person sees, so that is the cell's text here.
  const shown = td.querySelector(".cm-content") as HTMLElement | null;
  return {
    text: (shown ?? td).innerText.trim(), col: td.cellIndex, row: Array.from(table.rows).indexOf(tr),
    rowTexts: Array.from(tr.cells).map((c) => (c === td ? (shown ?? td).innerText : c.innerText).trim()),
    inSight: rect.top >= 0 && rect.bottom <= innerHeight,
    ref: td.classList.contains("companygraph-ref"), unresolved: td.classList.contains("is-unresolved"),
    path: td.getAttribute("data-companygraph-path"), shadow: style.boxShadow, fill: style.backgroundColor,
  };
}

export const focused = (ui: Driver) => ui.evaluate(focusedCell) as Promise<Cell | null>;

// The text the front note's editor holds. Runs in the page.
export function editorText() {
  return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string;
}
```

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: exit 0. The file has no test of its own; Tasks 3 to 6 are its tests.

---

### Task 3: A mention opens its own cell

**Files:**

- Create: `e2e/mention.e2e.ts`

**Interfaces:**

- Consumes: `start`, `available`, `Session`; `PROFILE`, `openNote`, `mentionsOf`, `tablesOf`, `focusedCell`, `editorText` from `e2e/notes.ts`.

- [ ] **Step 1: Write the test**

**File:** `e2e/mention.e2e.ts`

```ts
// Spec §1, the first defect: a mention clicked in the references pane opens the cell that holds
// its name — its own row and its own column, in sight — and the note is left as it was. Guards
// against release 0.5.1, which opened the row's first cell, could miss a long table altogether,
// and let Obsidian move the focus to the table's last row and write the table out again.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, editorText, focusedCell, mentionsOf, openNote, tablesOf } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("a mention in the references pane", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("opens the cell that holds its name, in its own row, and leaves the note alone", async () => {
    const { ui } = session;
    // An entity the profile names in a column that is not the first, in more rows than one, so a
    // wrong column and a wrong row both show. Found in the fixture, not written here.
    const candidates = await ui.evaluate((profile: string) => {
      const plugin = app.plugins.plugins.companygraph;
      const out: { target: string; rows: number }[] = [];
      for (const at of plugin.files.keys() as Iterable<string>) {
        if (!at.startsWith("model/") || !at.endsWith(".md")) continue;
        const rows = (plugin.referencesAt(at)?.in ?? []).flatMap((g: { mentions: { path: string; declared: string }[] }) => g.mentions)
          .filter((m: { path: string; declared: string }) => m.path === profile && m.declared.endsWith("· Experience")).length;
        if (rows > 1) out.push({ target: at, rows });
      }
      return out.sort((a, b) => b.rows - a.rows);
    }, [PROFILE]);
    assert.ok(candidates.length > 0, "the fixture names an experience in more than one row of the profile's Evidence table");
    const target = candidates[0].target;

    const mentions = (await mentionsOf(ui, target)).filter((m) => m.path === PROFILE && m.declared.endsWith("· Experience"));
    // The pane is open before the note comes forward, as it is for someone who keeps it open; a
    // pane opened over a note already in front is references-pane.e2e.ts's own question.
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:open-references"));
    for (const mention of [mentions[0], mentions[mentions.length - 1]]) {
      await openNote(ui, target);
      const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
      const table = tablesOf(before).find((t) => t.first <= mention.line && mention.line <= t.last)!;
      const want = { row: mention.line - table.first - 1, col: table.header.indexOf("Experience"), first: before.split("\n")[mention.line].split("|")[1].trim() };

      await ui.click((line: number) => {
        const pane = app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined;
        return Array.from(pane?.querySelectorAll<HTMLElement>("li.companygraph-open") ?? []).find((li) => li.querySelector(".companygraph-line")?.textContent === String(line));
      }, [mention.line + 1]);

      const cell = await ui.waitFor(`the cell of line ${mention.line + 1} to be open`, focusedCell);
      const landed = await ui.waitFor(`the focus to be in row ${want.row}, column ${want.col}`, (row: number, col: number) => {
        const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
        const tr = td?.closest("tr");
        return td && tr && td.cellIndex === col && Array.from(tr.closest("table")!.rows).indexOf(tr) === row;
      }, [want.row, want.col]).then(() => ui.evaluate(focusedCell)).catch(() => cell);
      assert.deepEqual({ row: landed!.row, col: landed!.col, text: landed!.text, first: landed!.rowTexts[0] },
        { row: want.row, col: want.col, text: mention.name, first: want.first });
      assert.ok(landed!.inSight, "the cell is in sight");

      // Longer than the rebuild's own delay and the repaint after it, which is when Obsidian
      // moved the focus and wrote the table out.
      await ui.never("the focus to leave the cell, or the note's text to change", (row: number, col: number, text: string) => {
        const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
        const tr = td?.closest("tr");
        const there = td && tr && td.cellIndex === col && Array.from(tr.closest("table")!.rows).indexOf(tr) === row;
        return !there || app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() !== text;
      }, [want.row, want.col, before], 1500);
      assert.equal(await ui.evaluate(editorText), before);
    }
  });
});
```

- [ ] **Step 2: Run it on the working tree and see it pass**

Run: `npm run e2e`
Expected: PASS.

- [ ] **Step 3: See it fail on the release that had the defect**

Run: `gh release download 0.5.1 --repo companygraph/obsidian-plugin --dir /tmp/companygraph-0.5.1 --clobber`, then `E2E_PLUGIN_DIR=/tmp/companygraph-0.5.1 node --test --test-concurrency=1 e2e/mention.e2e.ts`
Expected: FAIL on the column, since 0.5.1 opens the row's first cell. A test that passes here guards nothing and is rewritten.

---

### Task 4: A name being edited keeps its mark

**Files:**

- Create: `e2e/editing-mark.e2e.ts`

**Interfaces:**

- Consumes: as Task 3, and `focused`.

- [ ] **Step 1: Write the test**

**File:** `e2e/editing-mark.e2e.ts`

```ts
// Spec §1, the third defect: a name in a cell being edited keeps its mark and its path; one
// typed that names nothing reads as unresolved; one that names another entity resolves to it.
// Guards against release 0.5.1, where every cell being edited read as unresolved.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote, tablesOf } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("a name in a cell being edited", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.restore([PROFILE]).catch(() => {}); await session?.stop(); });

  test("keeps its mark, reads as unresolved when it names nothing, and resolves anew when it names another", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    const text = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    const skills = tablesOf(text).find((t) => t.header.join("|") === "Skill|Level")!;
    const levels = text.split("\n").slice(skills.first + 2, skills.last + 1).map((line) => line.split("|")[2].trim());
    const other = levels.find((level) => level !== levels[0])!;

    // The first body row's Level cell, clicked as a person clicks it.
    await ui.click(() => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[1]?.children[1]);
    await ui.waitFor("the Level cell to be open", focusedCell);
    // What marks a cell runs with the plugin's repaint; Check now asks for one, as a person can.
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:check-now"));
    const resting = await ui.waitFor("the cell being edited to carry its name's path", () => {
      const td = document.activeElement?.closest?.(".cm-table-widget td");
      return td?.getAttribute("data-companygraph-path") ? { path: td.getAttribute("data-companygraph-path"), unresolved: td.classList.contains("is-unresolved") } : null;
    });
    assert.equal(resting.unresolved, false);
    assert.match(resting.path!, /proficiency-levels\//);

    const retype = async (word: string) => {
      await ui.press("a", { meta: true });
      await ui.type(word);
    };
    await retype("Nonesuch");
    await ui.waitFor("a name that names nothing to read as unresolved", () =>
      document.activeElement?.closest?.(".cm-table-widget td")?.classList.contains("is-unresolved"));
    await retype(other);
    const renamed = await ui.waitFor("the other level's name to resolve", (first: string) => {
      const at = document.activeElement?.closest?.(".cm-table-widget td")?.getAttribute("data-companygraph-path");
      return at && !document.activeElement!.closest(".cm-table-widget td")!.classList.contains("is-unresolved") && at !== first ? at : null;
    }, [resting.path]);
    assert.match(renamed, /proficiency-levels\//);
  });
});
```

- [ ] **Step 2: Run it and see it pass; then see it fail on 0.5.1**

Run: `npm run e2e`, then `E2E_PLUGIN_DIR=/tmp/companygraph-0.5.1 node --test --test-concurrency=1 e2e/editing-mark.e2e.ts`
Expected: PASS, then FAIL waiting for the cell being edited to carry its name's path.

---

### Task 5: The cell that holds the focus carries the ring

**Files:**

- Create: `e2e/ring.e2e.ts`

- [ ] **Step 1: Write the test**

**File:** `e2e/ring.e2e.ts`

```ts
// Spec §1 and §6: the one cell being edited is drawn as a selection of one, in the dark theme
// and the light, and a cell of a selected range is left to Obsidian. What is held is that the
// style is there, not what color a theme makes it (spec §9). Guards against release 0.5.1,
// which drew nothing.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote } from "./notes.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";
const cellAt = (row: number, col: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[row]?.children[col];

describe("the cell that holds the focus", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  for (const theme of ["theme-dark", "theme-light"]) {
    test(`carries a ring and a fill in ${theme}, and its neighbour neither`, async () => {
      const { ui } = session;
      await ui.evaluate((name: string) => { document.body.classList.remove("theme-dark", "theme-light"); document.body.classList.add(name); }, [theme]);
      await openNote(ui, PROFILE);
      await ui.click(cellAt, [2, 0]);
      const cell = await ui.waitFor("the focused cell to carry a ring", () => {
        const td = document.activeElement?.closest?.(".cm-table-widget td");
        return td && getComputedStyle(td).boxShadow !== "none" ? { shadow: getComputedStyle(td).boxShadow, fill: getComputedStyle(td).backgroundColor } : null;
      });
      assert.match(cell.shadow, /inset/);
      assert.notEqual(cell.fill, "rgba(0, 0, 0, 0)");
      const neighbour = await ui.evaluate(() => getComputedStyle(document.activeElement!.closest("tr")!.nextElementSibling!.children[0]).boxShadow);
      assert.equal(neighbour, "none");
    });
  }

  test("is not drawn on a cell of a selected range, which Obsidian draws itself", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await ui.click(cellAt, [2, 0]);
    await ui.waitFor("a cell to be open", focusedCell);
    await ui.click(cellAt, [4, 1], { shift: true });
    const selected = await ui.waitFor("a range of cells to be selected", () => {
      const cells = Array.from(document.querySelectorAll(".cm-table-widget td.is-selected"));
      return cells.length > 1 ? cells.map((td) => getComputedStyle(td).boxShadow) : null;
    });
    assert.deepEqual(new Set(selected), new Set(["none"]));
  });
});
```

- [ ] **Step 2: Run it and see it pass; then see it fail on 0.5.1**

Run: `npm run e2e`, then `E2E_PLUGIN_DIR=/tmp/companygraph-0.5.1 node --test --test-concurrency=1 e2e/ring.e2e.ts`
Expected: PASS, then the two theme tests FAIL waiting for the ring; the range test passes on both, since it holds what is not drawn.

---

### Task 6: The form holds under a cell of a long table

**Files:**

- Create: `e2e/form.e2e.ts`

- [ ] **Step 1: Write the test**

**File:** `e2e/form.e2e.ts`

```ts
// Spec §1, the fourth defect: Cmd+S in a cell of a long table leaves the editor and the file in
// the family's Markdown form, the same cell open, and the file differing from before by the
// typed line alone. Guards against release 0.5.1, which left the table in Obsidian's padding,
// saved it so, and moved the focus to the table's last row.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, focusedCell, openNote, paddedLines, tablesOf } from "./notes.ts";
import { clearNotices, command, entityOf, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

describe("the Markdown form, saved from a cell", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.restore([PROFILE]).catch(() => {}); await session?.stop(); });

  test("holds under a cell in the middle of the note's longest table", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    assert.equal(paddedLines(before), 0, "the fixture is in the form");
    const longest = tablesOf(before).sort((a, b) => (b.last - b.first) - (a.last - a.first))[0];
    // A row in the middle: the form replaces runs of lines whole, and a cursor in the middle of a
    // long run is the one carried furthest from its cell.
    const line = longest.first + Math.floor((longest.last - longest.first) / 2);
    const row = line - longest.first - 1;
    // The last column, not the first. Tried on release 0.5.1: from a cell of the first column the
    // defect does not show, from a later one it does, and a test that passes on the release it
    // guards against guards nothing.
    const col = longest.header.length - 1;

    await ui.evaluate((at: number) => {
      const editor = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor;
      editor.scrollIntoView({ from: { line: at, ch: 0 }, to: { line: at, ch: 0 } }, true);
    }, [line]);
    await ui.click((first: number, at: number, column: number) => {
      const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view;
      const cm = view.editor.cm;
      const widget = Array.from(view.containerEl.querySelectorAll(".cm-table-widget") as NodeListOf<HTMLElement>)
        .find((el) => { try { return cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1 === first; } catch { return false; } });
      return widget?.querySelectorAll("tr")[at]?.children[column];
    }, [longest.first, row, col]);
    const opened = await ui.waitFor("the cell to be open", focusedCell);
    assert.deepEqual([opened.row, opened.col], [row, col]);

    await ui.press("End");
    await ui.type("x");
    await ui.waitFor("Obsidian to have padded the table under the edit", () =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)));

    await ui.press("s", { meta: true });
    const formed = (wantRow: number, wantCol: number) => {
      const text = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string;
      const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
      const tr = td?.closest("tr");
      const inPlace = td && tr && td.cellIndex === wantCol && Array.from(tr.closest("table")!.rows).indexOf(tr) === wantRow;
      return !text.split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)) && Boolean(inPlace);
    };
    await ui.waitFor("the editor to be in the form again with the same cell open", formed, [row, col]);
    await ui.never("the table to be padded again, or the focus to leave the cell", (wantRow: number, wantCol: number) => {
      const text = app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string;
      const td = document.activeElement?.closest?.(".cm-table-widget td") as HTMLTableCellElement | null;
      const tr = td?.closest("tr");
      const inPlace = td && tr && td.cellIndex === wantCol && Array.from(tr.closest("table")!.rows).indexOf(tr) === wantRow;
      return text.split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)) || !inPlace;
    }, [row, col], 2000);

    const after = await ui.waitFor("the file to hold the edit", async (at: string, was: string) => {
      const now = (await app.vault.adapter.read(at)) as string;
      return now !== was ? now : null;
    }, [PROFILE, before]);
    assert.equal(paddedLines(after), 0, "the file is in the form");
    const was = before.split("\n");
    const now = after.split("\n");
    assert.equal(now.length, was.length);
    assert.deepEqual(now.map((l, i) => (l === was[i] ? null : i)).filter((i) => i !== null), [line]);
    assert.ok(now[line].includes("x"));
  });

  test("Write this note in the form says so of a note already in it, and writes one that is not", async () => {
    const { ui } = session;
    await session.restore([PROFILE]);
    await openNote(ui, PROFILE);
    await ui.evaluate(() => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.focus());
    await clearNotices(ui);
    await command(ui, "write-form");
    await waitForNotice(ui, "already in the family's Markdown form");

    // A table padded the way an editor pads one, put there under the editor.
    const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    const skills = tablesOf(before).find((t) => t.header.join("|") === "Skill|Level")!;
    const lines = before.split("\n");
    lines[skills.first + 2] = lines[skills.first + 2].replace(/ \|$/, "      |");
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text), [PROFILE, lines.join("\n")]);
    await ui.waitFor("the editor to hold the padded row", () =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)));
    await command(ui, "write-form");
    await ui.waitFor("the editor to be in the form again", (text: string) => app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() === text, [before]);
  });

  test("a note left with a table Obsidian padded is written back into the form", async () => {
    const { ui } = session;
    await session.restore([PROFILE]);
    await openNote(ui, PROFILE);
    const before = await ui.evaluate(async (at: string) => app.vault.adapter.read(at) as string, [PROFILE]);
    await ui.click(() => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[2]?.children[1]);
    await ui.waitFor("the cell to be open", focusedCell);
    await ui.press("End");
    await ui.type("x");
    await ui.waitFor("Obsidian to have padded the table under the edit", () =>
      (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)));
    const other = await entityOf(ui, "skill");
    await openNote(ui, other);
    const left = await ui.waitFor("the note that was left to hold the edit, in the form", async (at: string, was: string) => {
      const now = (await app.vault.adapter.read(at)) as string;
      return now !== was && !now.split("\n").some((l) => l.startsWith("|") && / {2,}\|/.test(l)) ? now : null;
    }, [PROFILE, before]);
    assert.equal(paddedLines(left), 0);
    assert.equal(left.split("\n").filter((l, i) => l !== before.split("\n")[i]).length, 1, "the typed line and no other");
  });
});
```

- [ ] **Step 2: Run it and see it pass; then see it fail on 0.5.1**

Run: `npm run e2e`, then `E2E_PLUGIN_DIR=/tmp/companygraph-0.5.1 node --test --test-concurrency=1 e2e/form.e2e.ts`
Expected: PASS, then FAIL waiting for the editor to be in the form again with the same cell open.

---

### Task 7: The rules say so

**Files:**

- Modify: `AGENTS.md` (the Layout section and the Checks section), `docs/superpowers/specs/2026-09-18-obsidian-plugin-design.md` (§6, one paragraph), `README.md` (where it names the commands a contributor runs, if it does)

- [ ] **Step 1: AGENTS.md**

In `## Layout`, the sentence "A module is Obsidian's when it imports `obsidian` or `@codemirror/`, and those are kept thin because nothing here can run them: they are proven by hand on the reference instance." becomes:

```markdown
A module is Obsidian's when it imports `obsidian` or `@codemirror/`, and those are kept thin
because the unit suite cannot run them. `npm run e2e` can: it starts Obsidian on a copy of the
pinned reference instance and works the plugin with real clicks and keys, and
`docs/superpowers/specs/2026-09-20-run-in-obsidian-design.md` says how and why. **A change to one
of those modules runs `npm run e2e` before its pull request, and the `Verified:` line says that
it ran.** A defect found in Obsidian gets its test under `e2e/` first, seen to fail, as a defect
in a pure module gets its unit test first. A test there is handed a driver and never imports the
transport, never sleeps a fixed time to let something happen, and reads the pinned fixture, never
a live vault. What only a person can judge, whether a mark is strong enough or a list reads
well, is still tried by hand.
```

In `## Checks`, add `npm run e2e` to what is run, with the sentence that it needs an installed Obsidian, is skipped where there is none, and is not a CI job.

- [ ] **Step 2: The first design's §6**

The paragraph opening "The vault-facing layer is proven by hand on the reference instance" gains a closing sentence: "Since `2026-09-20-run-in-obsidian-design.md` that layer is also run, by `npm run e2e`, and the by-hand trial is kept for what only a person can judge."

- [ ] **Step 3: Check the prose**

Run: `sh conventions/conventions-check && sh conventions/conventions-format`
Expected: both pass.

---

### Task 8: Ten runs in a row

- [ ] **Step 1: Run the suite ten times and keep the count**

Run: `for i in 1 2 3 4 5 6 7 8 9 10; do npm run -s e2e > /tmp/e2e-$i.log 2>&1; echo "run $i exit $?"; done`
Expected: ten times `exit 0`. A run that fails is a finding: read `e2e/failures/`, find the cause, fix it under systematic debugging, and start the ten again. The spec's §7 ends the first step here and not before.

---

## What the first runs found, 2026-09-20

Recorded here because a plan that reads as if it went as written is a plan nobody can learn from.
The code blocks above are as they ended, not as they were first written.

A fifth defect, which nobody had reported. The references pane, opened by its command while an
entity's note is in front, stayed on "Put the cursor in an entity's note.": opening the pane
makes it the active view, and `refreshReferences` stood down for an active pane. It has its own
test, `e2e/references-pane.e2e.ts`, written first and seen to fail, and `openReferencesPane` now
draws whatever is active. The mention test opens the pane before the note, so it does not lean
on this.

`click` aims only at what has come to rest. The first click of the mention test was aimed while
the sidebar was still sliding open and landed where the row had been; two looks in a row now
have to agree on the element's middle.

The form test uses the table's last column. Tried on release 0.5.1, the defect does not show
from a cell of the first column and does from a later one, and the first version of the test
passed on the release it was meant to guard against.

The driver is `ui`, never `app`. The first version called the driver `app`, which inside a page
function is Obsidian's own untyped global, so `openNote(app, …)` passed the type check and failed
at run time. `AGENTS.md` carries the rule.

Early in the page's life Obsidian's global is not defined at all, and a bare `app` in the first
wait threw before it could wait; that one read goes through `window`.

Coverage, on the owner's question of what the suite covers. `npm run e2e:coverage` runs the suite
with `E2E_COVERAGE` set: the transport switches the protocol's precise coverage on, loads the
page again so that what the plugin does as it loads is counted, and each test file writes what
ran of the plugin's script under `e2e/coverage/`; `scripts/e2e-coverage.mjs` merges them and
reads the result against the markers esbuild writes above each module it bundles. It reports
bytes of the bundle and the functions never entered, module by module, and its head says what
that does and does not show. The first report is the map for part two: what ran least is what
has no test yet, the entity commands, the pickers, the two other panes, completion and the
settings tab.

Each of the four tests of the spec's §6 was then seen to fail on release 0.5.1 for its own
reason: the mention landed in the last row's first cell, the cell being edited never carried its
name's path, no ring was drawn in either theme, and the table was padded again four tenths of a
second into the watched window.
