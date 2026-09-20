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
