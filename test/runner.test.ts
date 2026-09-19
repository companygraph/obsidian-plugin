import test from "node:test";
import assert from "node:assert/strict";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import { argsFor, candidatesFor, findProgram, run } from "../src/runner.ts";
import type { Spawn } from "../src/runner.ts";

const STAND_IN = path.join(import.meta.dirname, "agent", "stand-in.mjs");
// The stand-in is a Node script, so "the program" is node with the script as its first argument.
const spawn: Spawn = (_command, args, options) => nodeSpawn(process.execPath, [STAND_IN, ...args], options);
const never = new AbortController().signal;

test("the program is the configured path, else the first candidate that exists", () => {
  assert.deepEqual(candidatesFor("/Users/x"), ["/Users/x/.local/bin/claude", "/opt/homebrew/bin/claude", "/usr/local/bin/claude"]);
  assert.equal(findProgram("/custom/claude", "/Users/x", () => false), "/custom/claude");
  assert.equal(findProgram("", "/Users/x", (p) => p === "/opt/homebrew/bin/claude"), "/opt/homebrew/bin/claude");
  assert.equal(findProgram("  ", "/Users/x", () => false), null);
});

test("the arguments are print mode, JSON out, the schema, read-only tools, no session, and the model if set", () => {
  const args = argsFor("P", { type: "object" }, null);
  assert.deepEqual(args, ["-p", "P", "--output-format", "json", "--json-schema", '{"type":"object"}', "--allowedTools", "Read", "Grep", "Glob", "--no-session-persistence"]);
  assert.deepEqual(argsFor("P", {}, "sonnet").slice(-2), ["--model", "sonnet"]);
});

test("a program that answers gives its output and how long it took", async () => {
  const outcome = await run(spawn, "claude", ["answer", "x"], process.cwd(), process.env, 5000, never);
  assert.equal(outcome.kind, "done");
  assert.ok(outcome.kind === "done" && JSON.parse(outcome.stdout).args[0] === "x");
});

test("a program that exits non-zero fails with what it said", async () => {
  const outcome = await run(spawn, "claude", ["fail"], process.cwd(), process.env, 5000, never);
  assert.deepEqual(outcome, { kind: "failed", why: "the agent exited with 3: not logged in" });
});

test("a program that runs past its time is ended", async () => {
  const outcome = await run(spawn, "claude", ["hang"], process.cwd(), process.env, 300, never);
  assert.deepEqual(outcome, { kind: "timeout" });
});

test("a cancel ends the program", async () => {
  const controller = new AbortController();
  const pending = run(spawn, "claude", ["hang"], process.cwd(), process.env, 5000, controller.signal);
  setTimeout(() => controller.abort(), 100);
  assert.deepEqual(await pending, { kind: "cancelled" });
});

test("a program that cannot be started fails with why", async () => {
  const outcome = await run((c, a, o) => nodeSpawn("/nonexistent/claude", a, o), "claude", [], process.cwd(), process.env, 5000, never);
  assert.equal(outcome.kind, "failed");
});
