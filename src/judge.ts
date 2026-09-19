// The run of the agent pass, wired to Obsidian (spec: "How a run goes"). What is asked and how the
// answer is read are agent.ts's, what is kept judgments.ts's, and the process runner.ts's; this
// starts one run at a time, reads the texts judged, records the answer and redraws.
import { FileSystemAdapter, Notice, Platform } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import { ANSWER_SCHEMA, promptFor, readAnswer } from "./agent.ts";
import type { Scope } from "./agent.ts";
import { recordRun } from "./judgments.ts";
import { argsFor, findProgram, run } from "./runner.ts";
import type { Spawn } from "./runner.ts";

const NOTE_MS = 3 * 60_000;
const INSTANCE_MS = 20 * 60_000;

// The desktop app's own Node modules, at run time only: a require in the bundle would stop it
// loading on a phone.
const node = (name: string): unknown => (window as unknown as { require?: (n: string) => unknown }).require?.(name);

export class Judging {
  plugin: CompanyGraphPlugin;
  running: { scope: Scope; started: number } | null = null;
  controller: AbortController | null = null;
  // Why the last run stored nothing, for the pane to say; null after a run that was read.
  failure: string | null = null;

  constructor(plugin: CompanyGraphPlugin) {
    this.plugin = plugin;
  }

  cancel() {
    this.controller?.abort();
  }

  async start(scope: Scope) {
    const plugin = this.plugin;
    if (!Platform.isDesktop) return void new Notice("The agent pass starts a program, which Obsidian allows on desktop only.");
    if (this.running) return void new Notice("A judgment is running; cancel it in the pane or wait for it.");
    const adapter = plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return void new Notice("The vault is not a folder on disk.");
    const fs = node("fs") as { existsSync(p: string): boolean } | undefined;
    const os = node("os") as { homedir(): string } | undefined;
    const cp = node("child_process") as { spawn: Spawn } | undefined;
    if (!fs || !os || !cp) return void new Notice("This Obsidian gives the plugin no way to start a program.");
    const program = findProgram(plugin.settings.program, os.homedir(), (p) => fs.existsSync(p));
    if (!program) return void new Notice("Claude Code was not found. Set its path in the plugin's settings.");

    const model = plugin.settings.model.trim() || null;
    const cwd = adapter.getBasePath();
    const bin = program.slice(0, program.lastIndexOf("/"));
    const env = { ...process.env, PATH: [bin, "/opt/homebrew/bin", "/usr/local/bin", process.env.PATH ?? ""].join(":") };
    this.controller = new AbortController();
    this.running = { scope, started: Date.now() };
    this.failure = null;
    plugin.show(plugin.state);
    const outcome = await run(cp.spawn, program, argsFor(promptFor(scope), ANSWER_SCHEMA, model), cwd, env, scope.kind === "note" ? NOTE_MS : INSTANCE_MS, this.controller.signal);
    this.running = null;
    this.controller = null;

    if (outcome.kind !== "done") {
      // A failed run may still have printed the agent's own JSON envelope with `is_error`, whose
      // reason (e.g. error_max_turns) says more than the exit code does; read for it, but never
      // let a failure to read one produce a second, confusing message.
      const reported = outcome.kind === "failed" && outcome.stdout ? readAnswer(outcome.stdout, () => null) : null;
      this.failure =
        outcome.kind === "timeout" ? "The judgment ran past its time and was ended; nothing was stored."
          : outcome.kind === "cancelled" ? "The judgment was canceled; nothing was stored."
          : reported && !reported.ok && reported.why.includes("reported an error") ? `${reported.why}. Nothing was stored.`
          : `The judgment failed: ${outcome.why}. Nothing was stored.`;
      plugin.show(plugin.state);
      return;
    }
    // The texts judged, read now, so the hash kept is of the text the agent read.
    const layout = plugin.layout;
    const texts = new Map<string, string>();
    for (const file of plugin.app.vault.getMarkdownFiles()) {
      if (!layout || !file.path.startsWith(`${layout.model}/`) || file.name === "README.md") continue;
      if (scope.kind === "note" && file.path !== scope.path) continue;
      texts.set(file.path, await plugin.app.vault.cachedRead(file));
    }
    const lineCount = (path: string) => {
      const text = texts.get(path) ?? plugin.files.get(path);
      return text === undefined ? null : text.split("\n").length;
    };
    const read = readAnswer(outcome.stdout, lineCount);
    if (!read.ok) {
      this.failure = `The agent's answer could not be read: ${read.why}. It began: ${read.head}`;
      plugin.show(plugin.state);
      return;
    }
    plugin.judged = recordRun(plugin.judged, scope, read.answer, read.info, texts, { at: new Date().toISOString(), seconds: outcome.seconds, model, program });
    await plugin.saveAll();
    plugin.show(plugin.state);
  }
}
