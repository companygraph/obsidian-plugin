// Starting the agent's program (spec: "How a run goes"). The process starter is handed in: in
// Obsidian it is the desktop app's own child_process, reached at run time so that the bundle holds
// no Node import and still loads on a phone; in the tests it is Node's, running a stand-in. Only
// the command line is Claude Code's here, so a second agent is a second way of writing it.
export function candidatesFor(home: string): string[] {
  return [`${home}/.local/bin/claude`, "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
}

// Obsidian started from the Dock does not inherit the shell's PATH, so a bare `claude` is not
// found there: the configured path, else the first place Claude Code installs to that exists.
export function findProgram(configured: string, home: string, exists: (path: string) => boolean): string | null {
  if (configured.trim()) return configured.trim();
  return candidatesFor(home).find((p) => exists(p)) ?? null;
}

// Print mode, the answer as JSON in the shape asked for, tools that read and nothing else, and
// no session left in the owner's list.
export function argsFor(prompt: string, schema: object, model: string | null): string[] {
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--allowedTools", "Read", "Grep", "Glob",
    "--no-session-persistence",
  ];
  return model ? [...args, "--model", model] : args;
}

export interface Child {
  stdout: { on(event: "data", cb: (chunk: unknown) => void): unknown };
  stderr: { on(event: "data", cb: (chunk: unknown) => void): unknown };
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}
export type Spawn = (command: string, args: string[], options: { cwd: string; env: Record<string, string | undefined> }) => Child;
export type Outcome =
  | { kind: "done"; stdout: string; seconds: number }
  | { kind: "failed"; why: string }
  | { kind: "timeout" }
  | { kind: "cancelled" };

export function run(
  spawn: Spawn,
  program: string,
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Outcome> {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = "";
    let err = "";
    let settled = false;
    let child: Child;
    const finish = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = () => {
      child?.kill("SIGTERM");
      finish({ kind: "cancelled" });
    };
    const timer = setTimeout(() => {
      child?.kill("SIGTERM");
      finish({ kind: "timeout" });
    }, timeoutMs);
    try {
      child = spawn(program, args, { cwd, env });
    } catch (error) {
      finish({ kind: "failed", why: `the agent could not be started: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    signal.addEventListener("abort", onAbort);
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.stderr.on("data", (chunk) => (err += String(chunk)));
    child.on("error", (error) => finish({ kind: "failed", why: `the agent could not be started: ${error.message}` }));
    child.on("close", (code) => {
      if (code === 0) finish({ kind: "done", stdout: out, seconds: Math.round((Date.now() - started) / 1000) });
      else finish({ kind: "failed", why: `the agent exited with ${code}: ${err.trim().split("\n")[0] ?? ""}`.trim() });
    });
  });
}
