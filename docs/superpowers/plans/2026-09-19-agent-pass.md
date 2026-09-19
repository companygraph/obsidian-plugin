# The agent pass from the pane — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two commands start Claude Code in the background, read-only, to judge a note or the whole instance against its schemas' writing rules, and the plugin keeps and shows the judgments apart from the mechanical failures.

**Architecture:** Three pure modules decide everything testable: `agent.ts` (the prompt, the answer's JSON Schema, reading an answer), `judgments.ts` (the store, a run recorded into it, rename and delete, staleness by hash) and `runner.ts` (finding the program, its arguments, running it with a timeout and a cancel through a process starter passed in). A thin controller, `judge.ts`, wires them to Obsidian; the pane, a CodeMirror state field for the amber marks, the status bar and a settings tab show and configure them.

**Tech Stack:** TypeScript run by Node's type stripping for tests (`node --test 'test/*.test.ts'`), esbuild for the bundle, Obsidian's plugin API, CodeMirror 6.

**Spec:** `docs/superpowers/specs/2026-09-19-agent-pass-design.md`

## Global Constraints

- The bundle holds no Node import: `main.js` also loads on a phone. `child_process` is reached at run time through `window.require`, on desktop only, and handed to `runner.ts`.
- The command line is `claude -p <prompt> --output-format json --json-schema <schema> --allowedTools Read Grep Glob --no-session-persistence`, plus `--model <model>` when one is set.
- Candidate program paths when none is configured: `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, in that order.
- Timeouts: a note run 3 minutes, an instance run 20 minutes. One run at a time.
- Judgments are stored in the plugin's own data (`loadData`/`saveData`), never in the instance.
- A judgment is never counted with the failures; the pane still closes on "writing rules are a judgment no check reads".
- Lines in the agent's answer count from one; inside the plugin they count from zero.
- Code comments and docs follow the repository's AGENTS.md: prose that says why, en-US, no numbers that move.
- Commits follow the family's git register (see `conventions/WORKING.md`): prose subject, one to three paragraphs, a `Verified:` line, the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Run `sh conventions/conventions-check` before each commit.
- Every command below runs with `export PATH=/opt/homebrew/bin:$PATH` first.

---

### Task 1: The prompt, the answer's shape, and reading an answer

**Files:**
- Create: `src/agent.ts`
- Test: `test/agent.test.ts`

**Interfaces:**
- Produces:
  - `type Scope = { kind: "note"; path: string } | { kind: "instance"; model: string }`
  - `const SKILL = "companygraph-validate"`
  - `function promptFor(scope: Scope): string`
  - `const ANSWER_SCHEMA: object` (a JSON Schema)
  - `interface Judgment { path: string; line: number; type: string; rule: string; judgment: string; placed: "line" | "loose" | "instance" }` — `line` zero-based
  - `interface Gap { profile: string; role: string; skill: string }`
  - `interface Answer { judgments: Judgment[]; gaps: Gap[]; notJudged: string[] }`
  - `interface RunInfo { cost: number | null; turns: number | null; denied: string[] }`
  - `type ReadAnswer = { ok: true; answer: Answer; info: RunInfo } | { ok: false; why: string; head: string }`
  - `function readAnswer(stdout: string, lineCount: (path: string) => number | null): ReadAnswer`

- [ ] **Step 1: Write the failing tests** in `test/agent.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_SCHEMA, SKILL, promptFor, readAnswer } from "../src/agent.ts";

const lines = (counts: Record<string, number>) => (path: string) => counts[path] ?? null;
const envelope = (structured: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 4, total_cost_usd: 0.41, permission_denials: [], structured_output: structured, ...extra });

test("a note's prompt names the skill, step 8 alone, the file, lines from one, and breaches only", () => {
  const p = promptFor({ kind: "note", path: "model/roles/writer.md" });
  assert.ok(p.includes(SKILL));
  assert.match(p, /step 8/);
  assert.match(p, /no other step/);
  assert.ok(p.includes("model/roles/writer.md"));
  assert.match(p, /counted from one/);
  assert.match(p, /breach/);
});

test("an instance's prompt names every entity under the container", () => {
  const p = promptFor({ kind: "instance", model: "model" });
  assert.match(p, /every entity/);
  assert.ok(p.includes("model/"));
});

test("the schema asks for judgments, gaps and what was not judged", () => {
  const s = ANSWER_SCHEMA as { required: string[]; properties: Record<string, unknown> };
  assert.deepEqual(s.required, ["judgments", "gaps", "notJudged"]);
});

test("an answer in the shape becomes judgments with lines from zero, gaps and what was not judged", () => {
  const read = readAnswer(
    envelope({
      judgments: [{ path: "model/roles/writer.md", line: 12, type: "role", rule: "Person-neutral.", judgment: "Names Rob." }],
      gaps: [{ profile: "Robert Blust", role: "Writer", skill: "Editing" }],
      notJudged: ["prose outside the writing rules"],
    }),
    lines({ "model/roles/writer.md": 40 }),
  );
  assert.ok(read.ok);
  assert.deepEqual(read.answer.judgments, [
    { path: "model/roles/writer.md", line: 11, type: "role", rule: "Person-neutral.", judgment: "Names Rob.", placed: "line" },
  ]);
  assert.deepEqual(read.answer.gaps, [{ profile: "Robert Blust", role: "Writer", skill: "Editing" }]);
  assert.deepEqual(read.answer.notJudged, ["prose outside the writing rules"]);
  assert.deepEqual(read.info, { cost: 0.41, turns: 4, denied: [] });
});

test("a line past the file's end is placed loosely on the first line; a path that is no entity under the instance", () => {
  const read = readAnswer(
    envelope({
      judgments: [
        { path: "model/roles/writer.md", line: 99, type: "role", rule: "R", judgment: "J" },
        { path: "model/nowhere.md", line: 3, type: "role", rule: "R", judgment: "J" },
      ],
      gaps: [],
      notJudged: [],
    }),
    lines({ "model/roles/writer.md": 40 }),
  );
  assert.ok(read.ok);
  assert.deepEqual(read.answer.judgments.map((j) => [j.line, j.placed]), [[0, "loose"], [0, "instance"]]);
});

test("an answer that is not the shape, not JSON, or an error is not read, and says why", () => {
  const bad = readAnswer(envelope({ judgments: "none" }), lines({}));
  assert.ok(!bad.ok && /shape/.test(bad.why));
  const junk = readAnswer("Not JSON at all", lines({}));
  assert.ok(!junk.ok && junk.head.startsWith("Not JSON"));
  const error = readAnswer(envelope(null, { is_error: true, subtype: "error_max_turns", result: "Ran out of turns" }), lines({}));
  assert.ok(!error.ok && /error_max_turns/.test(error.why));
});

test("a denied tool is said", () => {
  const read = readAnswer(
    envelope({ judgments: [], gaps: [], notJudged: [] }, { permission_denials: [{ tool_name: "Bash" }, { tool_name: "Write" }] }),
    lines({}),
  );
  assert.ok(read.ok);
  assert.deepEqual(read.info.denied, ["Bash", "Write"]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/agent.test.ts`
Expected: FAIL, `Cannot find module '../src/agent.ts'`.

- [ ] **Step 3: Write `src/agent.ts`**

```ts
// The agent pass (docs/superpowers/specs/2026-09-19-agent-pass-design.md): what the agent is asked
// and how its answer is read. The instance's own companygraph-validate skill is the authority on
// what the writing rules are; this names its step 8, the files, and the shape of the answer, and
// says nothing of the rules themselves. Pure.
export type Scope = { kind: "note"; path: string } | { kind: "instance"; model: string };

export const SKILL = "companygraph-validate";

export function promptFor(scope: Scope): string {
  const what =
    scope.kind === "note"
      ? `the entity in the file ${scope.path}`
      : `every entity under ${scope.model}/`;
  return [
    `Run step 8 of the ${SKILL} skill, and no other step: the mechanical rules are checked elsewhere.`,
    `Judge ${what} against its schema's writing rules, one rule at a time, with the gap lines and the lines only reading can judge that step 8 names.`,
    "Report a breach, not a rule kept.",
    "For each breach, give the file's path from the vault's root, the line it is on counted from one as the file has it, the entity's type, the rule in the schema's own words, and one or two sentences on why.",
    "List what you did not judge, so a clean answer is not read as more than it is.",
    "Read files only; change nothing.",
  ].join("\n");
}

export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    judgments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          line: { type: "integer" },
          type: { type: "string" },
          rule: { type: "string" },
          judgment: { type: "string" },
        },
        required: ["path", "line", "type", "rule", "judgment"],
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: { profile: { type: "string" }, role: { type: "string" }, skill: { type: "string" } },
        required: ["profile", "role", "skill"],
      },
    },
    notJudged: { type: "array", items: { type: "string" } },
  },
  required: ["judgments", "gaps", "notJudged"],
};

export interface Judgment {
  path: string;
  line: number; // zero-based
  type: string;
  rule: string;
  judgment: string;
  // "line": on its line; "loose": its line is past the file's end, so on the first; "instance":
  // its path is no entity of the vault, so under the instance.
  placed: "line" | "loose" | "instance";
}
export interface Gap { profile: string; role: string; skill: string }
export interface Answer { judgments: Judgment[]; gaps: Gap[]; notJudged: string[] }
export interface RunInfo { cost: number | null; turns: number | null; denied: string[] }
export type ReadAnswer = { ok: true; answer: Answer; info: RunInfo } | { ok: false; why: string; head: string };

const isString = (v: unknown): v is string => typeof v === "string";
const head = (text: string) => text.split("\n").slice(0, 5).join("\n").slice(0, 400);

// The answer Claude Code prints with `--output-format json`, read against the shape asked for.
// `lineCount` says how many lines a path's file has, or null where it is no entity of the vault.
export function readAnswer(stdout: string, lineCount: (path: string) => number | null): ReadAnswer {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return { ok: false, why: "the agent's answer is not JSON", head: head(stdout) };
  }
  if (envelope.is_error === true)
    return { ok: false, why: `the agent reported an error: ${String(envelope.subtype ?? "")} ${String(envelope.result ?? "")}`.trim(), head: head(stdout) };
  const out = envelope.structured_output as Record<string, unknown> | null | undefined;
  const judgments = out?.judgments;
  const gaps = out?.gaps;
  const notJudged = out?.notJudged;
  if (!Array.isArray(judgments) || !Array.isArray(gaps) || !Array.isArray(notJudged) || !notJudged.every(isString))
    return { ok: false, why: "the agent's answer is not in the shape asked for", head: head(stdout) };
  const read: Judgment[] = [];
  for (const j of judgments as Record<string, unknown>[]) {
    if (!isString(j.path) || typeof j.line !== "number" || !isString(j.type) || !isString(j.rule) || !isString(j.judgment))
      return { ok: false, why: "a judgment in the agent's answer is not in the shape asked for", head: head(stdout) };
    const count = lineCount(j.path);
    const line = Math.floor(j.line) - 1;
    const placed = count === null ? "instance" : line < 0 || line >= count ? "loose" : "line";
    read.push({ path: j.path, line: placed === "line" ? line : 0, type: j.type, rule: j.rule, judgment: j.judgment, placed });
  }
  const readGaps: Gap[] = [];
  for (const g of gaps as Record<string, unknown>[]) {
    if (!isString(g.profile) || !isString(g.role) || !isString(g.skill))
      return { ok: false, why: "a gap in the agent's answer is not in the shape asked for", head: head(stdout) };
    readGaps.push({ profile: g.profile, role: g.role, skill: g.skill });
  }
  const denials = Array.isArray(envelope.permission_denials) ? (envelope.permission_denials as Record<string, unknown>[]) : [];
  return {
    ok: true,
    answer: { judgments: read, gaps: readGaps, notJudged },
    info: {
      cost: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null,
      turns: typeof envelope.num_turns === "number" ? envelope.num_turns : null,
      denied: denials.map((d) => String(d.tool_name ?? "a tool")),
    },
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/agent.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck, then commit**

Run: `npm run typecheck && sh conventions/conventions-check`
Commit `src/agent.ts` and `test/agent.test.ts` with a prose subject such as "What the agent is asked, and how its answer is read".

---

### Task 2: The store of judgments, and when one is stale

**Files:**
- Create: `src/judgments.ts`
- Test: `test/judgments.test.ts`

**Interfaces:**
- Consumes: `Judgment`, `Gap`, `Answer`, `RunInfo`, `Scope` from `src/agent.ts`.
- Produces:
  - `interface Entry { hash: string; judgments: Judgment[] }`
  - `interface LastRun { scope: "note" | "instance"; path: string | null; at: string; seconds: number; cost: number | null; model: string | null; denied: string[] }`
  - `interface Store { entries: Record<string, Entry>; instance: Judgment[]; gaps: Gap[]; notJudged: string[]; last: LastRun | null }`
  - `const EMPTY: Store`
  - `function hashOf(text: string): string`
  - `function recordRun(store: Store, scope: Scope, answer: Answer, info: RunInfo, texts: Map<string, string>, meta: { at: string; seconds: number; model: string | null }): Store`
  - `function renamedIn(store: Store, from: string, to: string): Store`
  - `function removedFrom(store: Store, path: string): Store`
  - `function isStale(entry: Entry, text: string | null): boolean`
  - `function countsOf(store: Store, textOf: (path: string) => string | null): { current: number; stale: number }`
  - `function storeFrom(data: unknown): Store` (reads saved data defensively)

- [ ] **Step 1: Write the failing tests** in `test/judgments.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY, countsOf, hashOf, isStale, recordRun, removedFrom, renamedIn, storeFrom } from "../src/judgments.ts";
import type { Answer, Judgment } from "../src/agent.ts";

const j = (path: string, line: number, placed: Judgment["placed"] = "line"): Judgment =>
  ({ path, line, type: "role", rule: "R", judgment: "J", placed });
const answer = (judgments: Judgment[]): Answer => ({ judgments, gaps: [{ profile: "P", role: "R", skill: "S" }], notJudged: ["n"] });
const info = { cost: 0.4, turns: 3, denied: [] };
const meta = { at: "2026-09-19T20:00:00Z", seconds: 42, model: null };
const texts = new Map([["model/a.md", "# A\n"], ["model/b.md", "# B\n"]]);

test("the same text hashes alike and another text not", () => {
  assert.equal(hashOf("x"), hashOf("x"));
  assert.notEqual(hashOf("x"), hashOf("y"));
});

test("a note run replaces its note's entry and leaves the rest, the gaps and the instance's", () => {
  const first = recordRun(EMPTY, { kind: "instance", model: "model" }, answer([j("model/a.md", 1), j("model/b.md", 2), j("model/x.md", 0, "instance")]), info, texts, meta);
  assert.deepEqual(Object.keys(first.entries).sort(), ["model/a.md", "model/b.md"]);
  assert.equal(first.instance.length, 1);
  const second = recordRun(first, { kind: "note", path: "model/a.md" }, { judgments: [], gaps: [], notJudged: [] }, info, texts, meta);
  assert.deepEqual(second.entries["model/a.md"].judgments, []);
  assert.equal(second.entries["model/b.md"].judgments.length, 1);
  assert.equal(second.gaps.length, 1);
  assert.equal(second.instance.length, 1);
  assert.equal(second.last!.scope, "note");
});

test("an instance run replaces every entry, and a clean entity has an entry of its own", () => {
  const first = recordRun(EMPTY, { kind: "instance", model: "model" }, answer([j("model/a.md", 1)]), info, texts, meta);
  assert.deepEqual(first.entries["model/b.md"].judgments, []);
  const again = recordRun(first, { kind: "instance", model: "model" }, answer([]), info, new Map([["model/b.md", "# B\n"]]), meta);
  assert.deepEqual(Object.keys(again.entries), ["model/b.md"]);
});

test("an entry is stale once its note's text is not the text judged", () => {
  const s = recordRun(EMPTY, { kind: "note", path: "model/a.md" }, answer([j("model/a.md", 0)]), info, texts, meta);
  const entry = s.entries["model/a.md"];
  assert.equal(isStale(entry, "# A\n"), false);
  assert.equal(isStale(entry, "# A changed\n"), true);
  assert.equal(isStale(entry, null), true);
  assert.deepEqual(countsOf(s, (p) => (p === "model/a.md" ? "# A\n" : null)), { current: 1, stale: 0 });
  assert.deepEqual(countsOf(s, () => "other"), { current: 0, stale: 1 });
});

test("a rename moves an entry and its judgments; a delete drops it", () => {
  const s = recordRun(EMPTY, { kind: "note", path: "model/a.md" }, answer([j("model/a.md", 0)]), info, texts, meta);
  const moved = renamedIn(s, "model/a.md", "model/c.md");
  assert.equal(moved.entries["model/a.md"], undefined);
  assert.equal(moved.entries["model/c.md"].judgments[0].path, "model/c.md");
  assert.equal(removedFrom(moved, "model/c.md").entries["model/c.md"], undefined);
});

test("saved data that is missing or malformed reads as the empty store", () => {
  assert.deepEqual(storeFrom(undefined), EMPTY);
  assert.deepEqual(storeFrom({ entries: "no" }), EMPTY);
  const s = recordRun(EMPTY, { kind: "note", path: "model/a.md" }, answer([j("model/a.md", 0)]), info, texts, meta);
  assert.deepEqual(storeFrom(JSON.parse(JSON.stringify(s))), s);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/judgments.test.ts`
Expected: FAIL, `Cannot find module '../src/judgments.ts'`.

- [ ] **Step 3: Write `src/judgments.ts`**

```ts
// What the agent judged, kept in the plugin's own data and never in the instance (spec: "Where
// judgments go"). Per note, the hash of the text judged, so a note changed since shows its
// judgments as judging an earlier version. Pure.
import type { Answer, Gap, Judgment, RunInfo, Scope } from "./agent.ts";

export interface Entry { hash: string; judgments: Judgment[] }
export interface LastRun {
  scope: "note" | "instance";
  path: string | null;
  at: string;
  seconds: number;
  cost: number | null;
  model: string | null;
  denied: string[];
}
export interface Store {
  entries: Record<string, Entry>;
  instance: Judgment[]; // judgments whose path is no entity of the vault
  gaps: Gap[];
  notJudged: string[];
  last: LastRun | null;
}

export const EMPTY: Store = { entries: {}, instance: [], gaps: [], notJudged: [], last: null };

// FNV-1a over the text's UTF-16 units, as hex: enough to tell a changed note from the one judged.
export function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(16)}-${h.toString(16)}`;
}

// A run recorded: a note run replaces its note's entry; an instance run replaces every entry,
// the instance's own judgments and the gaps, and gives every entity it was handed an entry, a
// clean one included, so a clean note reads as judged and not as never judged.
export function recordRun(
  store: Store,
  scope: Scope,
  answer: Answer,
  info: RunInfo,
  texts: Map<string, string>,
  meta: { at: string; seconds: number; model: string | null },
): Store {
  const placed = answer.judgments.filter((j) => j.placed !== "instance");
  const elsewhere = answer.judgments.filter((j) => j.placed === "instance");
  const last: LastRun = {
    scope: scope.kind,
    path: scope.kind === "note" ? scope.path : null,
    at: meta.at,
    seconds: meta.seconds,
    cost: info.cost,
    model: meta.model,
    denied: info.denied,
  };
  if (scope.kind === "note") {
    const text = texts.get(scope.path) ?? "";
    return {
      ...store,
      entries: { ...store.entries, [scope.path]: { hash: hashOf(text), judgments: placed.filter((j) => j.path === scope.path) } },
      notJudged: answer.notJudged,
      last,
    };
  }
  const entries: Record<string, Entry> = {};
  for (const [path, text] of texts) entries[path] = { hash: hashOf(text), judgments: [] };
  for (const j of placed) if (entries[j.path]) entries[j.path].judgments.push(j);
  return { entries, instance: elsewhere, gaps: answer.gaps, notJudged: answer.notJudged, last };
}

export function renamedIn(store: Store, from: string, to: string): Store {
  const entry = store.entries[from];
  if (!entry) return store;
  const entries = { ...store.entries };
  delete entries[from];
  entries[to] = { ...entry, judgments: entry.judgments.map((j) => ({ ...j, path: to })) };
  return { ...store, entries };
}

export function removedFrom(store: Store, path: string): Store {
  if (!store.entries[path]) return store;
  const entries = { ...store.entries };
  delete entries[path];
  return { ...store, entries };
}

// Stale: the note's text is not the text judged, or the note is gone.
export const isStale = (entry: Entry, text: string | null): boolean => text === null || hashOf(text) !== entry.hash;

export function countsOf(store: Store, textOf: (path: string) => string | null): { current: number; stale: number } {
  let current = 0;
  let stale = 0;
  for (const [path, entry] of Object.entries(store.entries)) {
    if (isStale(entry, textOf(path))) stale += entry.judgments.length;
    else current += entry.judgments.length;
  }
  return { current, stale };
}

// Saved data read back, trusting nothing: anything not in the shape is the empty store.
export function storeFrom(data: unknown): Store {
  const d = data as Partial<Store> | null | undefined;
  if (!d || typeof d !== "object" || typeof d.entries !== "object" || d.entries === null || Array.isArray(d.entries)) return EMPTY;
  return {
    entries: d.entries as Record<string, Entry>,
    instance: Array.isArray(d.instance) ? d.instance : [],
    gaps: Array.isArray(d.gaps) ? d.gaps : [],
    notJudged: Array.isArray(d.notJudged) ? d.notJudged : [],
    last: d.last ?? null,
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/judgments.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck, then commit** `src/judgments.ts` and `test/judgments.test.ts`.

---

### Task 3: Finding the program and running it

**Files:**
- Create: `src/runner.ts`
- Create: `test/agent/stand-in.mjs` (the stand-in program)
- Test: `test/runner.test.ts`

**Interfaces:**
- Produces:
  - `function candidatesFor(home: string): string[]`
  - `function findProgram(configured: string, home: string, exists: (path: string) => boolean): string | null`
  - `function argsFor(prompt: string, schema: object, model: string | null): string[]`
  - `interface Child { stdout: { on(event: "data", cb: (chunk: unknown) => void): unknown }; stderr: { on(event: "data", cb: (chunk: unknown) => void): unknown }; on(event: "close", cb: (code: number | null) => void): unknown; on(event: "error", cb: (error: Error) => void): unknown; kill(signal?: string): unknown }`
  - `type Spawn = (command: string, args: string[], options: { cwd: string; env: Record<string, string | undefined> }) => Child`
  - `type Outcome = { kind: "done"; stdout: string; seconds: number } | { kind: "failed"; why: string } | { kind: "timeout" } | { kind: "cancelled" }`
  - `function run(spawn: Spawn, program: string, args: string[], cwd: string, env: Record<string, string | undefined>, timeoutMs: number, signal: AbortSignal): Promise<Outcome>`

- [ ] **Step 1: Write the stand-in program** `test/agent/stand-in.mjs`. It behaves as the first argument after `--stand-in` says, so one file covers every case:

```js
// A stand-in for the agent's program in the runner's tests, so no test starts a model or pays
// for one. Its first argument says what to do: answer, fail, or hang past a timeout.
const mode = process.argv[2];
if (mode === "answer") {
  process.stdout.write(JSON.stringify({ is_error: false, structured_output: { judgments: [], gaps: [], notJudged: [] }, args: process.argv.slice(3) }));
} else if (mode === "fail") {
  process.stderr.write("not logged in\n");
  process.exit(3);
} else if (mode === "hang") {
  setTimeout(() => {}, 60_000);
}
```

- [ ] **Step 2: Write the failing tests** in `test/runner.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test test/runner.test.ts`
Expected: FAIL, `Cannot find module '../src/runner.ts'`.

- [ ] **Step 4: Write `src/runner.ts`**

```ts
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
  kill(signal?: string): unknown;
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/runner.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck, build, and check the bundle holds no Node import**

Run: `npm run typecheck && npm run build && ! grep -q 'require("child_process")' main.js && echo clean`
Expected: `clean` (runner.ts imports nothing from Node; nothing uses it yet).

- [ ] **Step 7: Commit** `src/runner.ts`, `test/runner.test.ts`, `test/agent/stand-in.mjs`.

---

### Task 4: Settings, stored judgments, the run controller and the commands

**Files:**
- Create: `src/settings.ts`
- Create: `src/judge.ts`
- Modify: `src/main.ts` (fields, `onload`, the vault's rename and delete handlers, `rebuild` keeps the files it read)

**Interfaces:**
- Consumes: Task 1 `promptFor`, `ANSWER_SCHEMA`, `readAnswer`, `Scope`; Task 2 `Store`, `EMPTY`, `recordRun`, `renamedIn`, `removedFrom`, `storeFrom`; Task 3 `findProgram`, `argsFor`, `run`, `Spawn`.
- Produces:
  - `interface Settings { program: string; model: string }`, `const DEFAULTS: Settings`, `class CompanyGraphSettings extends PluginSettingTab` in `src/settings.ts`
  - On the plugin: `settings: Settings`, `judged: Store`, `files: Map<string, string>` (the last rebuild's map), `judging: Judging`, `async saveAll(): Promise<void>`
  - `class Judging { running: { scope: Scope; started: number } | null; start(scope: Scope): Promise<void>; cancel(): void }` in `src/judge.ts`; it calls `plugin.show(plugin.state)` after every change so the pane, marks and status bar redraw.

- [ ] **Step 1: Write `src/settings.ts`**

```ts
// The agent's program and model (spec: "Finding the program"). Empty, the program is looked for
// where Claude Code installs to; empty, the model is the program's own default.
import { PluginSettingTab, Setting } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";

export interface Settings { program: string; model: string }
export const DEFAULTS: Settings = { program: "", model: "" };

export class CompanyGraphSettings extends PluginSettingTab {
  plugin: CompanyGraphPlugin;

  constructor(plugin: CompanyGraphPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    const el = this.containerEl;
    el.empty();
    new Setting(el).setName("The agent pass").setHeading();
    new Setting(el)
      .setName("Claude Code")
      .setDesc("The path to the claude program. Empty, the places Claude Code installs to are tried: ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.")
      .addText((t) => t.setPlaceholder("found where it installs").setValue(this.plugin.settings.program).onChange(async (v) => {
        this.plugin.settings.program = v;
        await this.plugin.saveAll();
      }));
    new Setting(el)
      .setName("Model")
      .setDesc("Passed as --model. Empty, Claude Code's own default.")
      .addText((t) => t.setPlaceholder("default").setValue(this.plugin.settings.model).onChange(async (v) => {
        this.plugin.settings.model = v;
        await this.plugin.saveAll();
      }));
  }
}
```

- [ ] **Step 2: Write `src/judge.ts`**

```ts
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
      this.failure =
        outcome.kind === "timeout" ? "The judgment ran past its time and was ended; nothing was stored."
          : outcome.kind === "cancelled" ? "The judgment was cancelled; nothing was stored."
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
    plugin.judged = recordRun(plugin.judged, scope, read.answer, read.info, texts, { at: new Date().toISOString(), seconds: outcome.seconds, model });
    await plugin.saveAll();
    plugin.show(plugin.state);
  }
}
```

- [ ] **Step 3: Wire it into `src/main.ts`**

Add the imports next to the others:

```ts
import { CompanyGraphSettings, DEFAULTS } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { Judging } from "./judge.ts";
import { EMPTY, removedFrom, renamedIn, storeFrom } from "./judgments.ts";
import type { Store } from "./judgments.ts";
```

Add the fields beside `schemas`:

```ts
  // The agent pass: its settings, what it judged, the run under way, and the files the last
  // rebuild read, which say whether a judgment is of the note as it now is.
  settings: Settings = { ...DEFAULTS };
  judged: Store = EMPTY;
  judging = new Judging(this);
  files = new Map<string, string>();

  async saveAll() {
    await this.saveData({ settings: this.settings, judged: this.judged });
  }
```

At the top of `onload`, before anything that paints:

```ts
    const saved = (await this.loadData()) as { settings?: Partial<Settings>; judged?: unknown } | null;
    this.settings = { ...DEFAULTS, ...(saved?.settings ?? {}) };
    this.judged = storeFrom(saved?.judged);
    this.addSettingTab(new CompanyGraphSettings(this));
```

Beside the other commands:

```ts
    this.addCommand({
      id: "judge-note",
      name: "Judge this note against its writing rules",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && !!this.layout && file.path.startsWith(`${this.layout.model}/`);
        if (ok && !checking) void this.judging.start({ kind: "note", path: file!.path });
        return ok;
      },
    });
    this.addCommand({
      id: "judge-instance",
      name: "Judge the instance against its writing rules",
      checkCallback: (checking) => {
        const layout = this.layout;
        if (layout && !checking) void this.judging.start({ kind: "instance", model: layout.model });
        return !!layout;
      },
    });
    this.addCommand({
      id: "cancel-judgment",
      name: "Cancel the judgment under way",
      checkCallback: (checking) => {
        if (this.judging.running && !checking) this.judging.cancel();
        return !!this.judging.running;
      },
    });
```

In the vault's `delete` handler registered in `onLayoutReady`, and its `rename` handler, keep the store in step (replace the two existing registrations):

```ts
      this.registerEvent(this.app.vault.on("delete", (file) => {
        this.judged = removedFrom(this.judged, file.path);
        void this.saveAll();
        changed(file.path);
      }));
      this.registerEvent(this.app.vault.on("rename", (file, old) => {
        // Obsidian moves the renamed note's entry in its map of links to the new path; what the
        // model added to it, and the model's links from and to it, move with it before anything
        // else happens, or they would stay behind under a path that no longer exists.
        rename(this.links, this.added, old, file.path);
        this.judged = renamedIn(this.judged, old, file.path);
        void this.saveAll();
        changed(file.path);
        changed(old);
      }));
```

In `rebuild`, right after `const files = await readInstance(this.app, this.layout);` and its generation check, keep the map:

```ts
      this.files = files;
```

- [ ] **Step 4: Typecheck, test, build, and check the bundle**

Run: `npm run typecheck && npm test && npm run build && ! grep -q 'require("child_process")' main.js && echo clean`
Expected: every test passes; `clean`.

- [ ] **Step 5: Commit** `src/settings.ts`, `src/judge.ts`, `src/main.ts`.

---

### Task 5: Showing judgments: the pane, the amber mark, the status bar

**Files:**
- Create: `src/judgedmarks.ts`
- Modify: `src/pane.ts` (a section below "Not checked", the run at the top)
- Modify: `src/main.ts` (`show` adds the count; `paint` sends the marks; the pane redraws each second while a run is under way)
- Modify: `styles.css`
- Create: `src/judgedview.ts` (pure: what the pane lists)
- Test: `test/judgedview.test.ts`

**Interfaces:**
- Consumes: Task 2 `Store`, `isStale`, `countsOf`; Task 1 `Judgment`; Task 4 `plugin.judged`, `plugin.files`, `plugin.judging`.
- Produces:
  - `interface JudgedGroup { path: string | null; stale: boolean; judgments: Judgment[] }`
  - `function judgedGroups(store: Store, textOf: (path: string) => string | null): JudgedGroup[]` in `src/judgedview.ts`
  - `const setJudged: StateEffectType<{ line: number; message: string }[]>` and `const judgedField` in `src/judgedmarks.ts`

- [ ] **Step 1: Write the failing test** `test/judgedview.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { judgedGroups } from "../src/judgedview.ts";
import { EMPTY, recordRun } from "../src/judgments.ts";
import type { Judgment } from "../src/agent.ts";

const j = (path: string, line: number, placed: Judgment["placed"] = "line"): Judgment => ({ path, line, type: "role", rule: "R", judgment: "J", placed });
const texts = new Map([["model/a.md", "# A\n"], ["model/b.md", "# B\n"]]);
const store = recordRun(EMPTY, { kind: "instance", model: "model" }, { judgments: [j("model/b.md", 3), j("model/b.md", 1), j("model/a.md", 0), j("x.md", 0, "instance")], gaps: [], notJudged: [] }, { cost: null, turns: null, denied: [] }, texts, { at: "t", seconds: 1, model: null });

test("judgments are grouped by file in path order, lines in order, the instance's last, clean files left out", () => {
  const groups = judgedGroups(store, (p) => texts.get(p) ?? null);
  assert.deepEqual(groups.map((g) => [g.path, g.stale, g.judgments.map((x) => x.line)]), [
    ["model/a.md", false, [0]],
    ["model/b.md", false, [1, 3]],
    [null, false, [0]],
  ]);
});

test("a file changed since it was judged is a stale group", () => {
  const groups = judgedGroups(store, (p) => (p === "model/a.md" ? "# A changed\n" : texts.get(p) ?? null));
  assert.equal(groups.find((g) => g.path === "model/a.md")!.stale, true);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/judgedview.test.ts`
Expected: FAIL, `Cannot find module '../src/judgedview.ts'`.

- [ ] **Step 3: Write `src/judgedview.ts`**

```ts
// What the pane lists of the judgments: by file in path order, each file's by line, a file whose
// text changed since as stale, a clean file not at all, and the judgments placed on no entity last,
// under the instance. Pure.
import type { Judgment } from "./agent.ts";
import { isStale } from "./judgments.ts";
import type { Store } from "./judgments.ts";

export interface JudgedGroup { path: string | null; stale: boolean; judgments: Judgment[] }

export function judgedGroups(store: Store, textOf: (path: string) => string | null): JudgedGroup[] {
  const groups: JudgedGroup[] = Object.entries(store.entries)
    .filter(([, entry]) => entry.judgments.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, entry]) => ({
      path,
      stale: isStale(entry, textOf(path)),
      judgments: [...entry.judgments].sort((x, y) => x.line - y.line),
    }));
  if (store.instance.length) groups.push({ path: null, stale: false, judgments: store.instance });
  return groups;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/judgedview.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `src/judgedmarks.ts`**, a line mark of its own, apart from a failure's:

```ts
// A judged line in the editor: a quiet amber mark with the rule and the judgment as its tooltip,
// apart from a failure's red, and only on a note not changed since it was judged, since the lines
// of one that has may have moved (spec: "Shown").
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";

export const setJudged = StateEffect.define<{ line: number; message: string }[]>();

export const judgedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setJudged)) continue;
      const byLine = new Map<number, string[]>();
      for (const m of effect.value) byLine.set(m.line, [...(byLine.get(m.line) ?? []), m.message]);
      const builder = new RangeSetBuilder<Decoration>();
      for (const [line, messages] of [...byLine].sort((a, b) => a[0] - b[0])) {
        if (line >= tr.state.doc.lines) continue;
        const from = tr.state.doc.line(line + 1).from;
        builder.add(from, from, Decoration.line({ class: "companygraph-judged", attributes: { "aria-label": messages.join("\n") } }));
      }
      marks = builder.finish();
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
```

- [ ] **Step 6: Wire the marks and the count into `src/main.ts`**

Import them: `import { judgedField, setJudged } from "./judgedmarks.ts";` and `import { countsOf, isStale } from "./judgments.ts";` (extend the Task 4 import). Register the field beside `marksField`: `this.registerEditorExtension(judgedField);`.

In `paint`, where each leaf dispatches `setMarks`, add the judged lines of a note not stale:

```ts
      const entry = this.judged.entries[path];
      const judged = entry && !isStale(entry, leaf.view.editor.getValue())
        ? entry.judgments.filter((j) => j.placed === "line").map((j) => ({ line: j.line, message: `${j.rule}\n${j.judgment}` }))
        : [];
      view?.dispatch({ effects: [setMarks.of(marks), setJudged.of(judged), refreshNames.of(null)] });
```

(replacing the existing `view?.dispatch({ effects: [setMarks.of(marks), refreshNames.of(null)] });`).

In `show`, append the judged count to the checked status line:

```ts
    const judged = countsOf(this.judged, (p) => this.files.get(p) ?? null);
    const judgedText = this.judging.running ? ", judging…"
      : judged.current + judged.stale === 0 ? ""
      : `, ${judged.current} judged${judged.stale ? ` (${judged.stale} stale)` : ""}`;
```

and add `${judgedText}` to the end of the `checked` branch's template, before the closing backtick.

While a run is under way the pane redraws each second so its clock moves; add to `onload`:

```ts
    this.registerInterval(window.setInterval(() => {
      if (!this.judging.running) return;
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof Pane) leaf.view.render();
    }, 1000));
```

- [ ] **Step 7: The pane section in `src/pane.ts`**

Import `judgedGroups` from `./judgedview.ts`. At the start of `render`, after the banner and before the early returns, the run under way or the last failure:

```ts
    const judging = this.plugin.judging;
    if (judging.running) {
      const run = el.createDiv({ cls: "companygraph-run" });
      const secs = Math.round((Date.now() - judging.running.started) / 1000);
      const what = judging.running.scope.kind === "note" ? judging.running.scope.path : "the instance";
      run.createSpan({ text: `Claude Code is judging ${what} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` });
      run.createEl("button", { text: "Cancel" }).onClickEvent(() => judging.cancel());
    } else if (judging.failure) {
      el.createDiv({ cls: "companygraph-pane-note companygraph-notice", text: judging.failure });
    }
```

At the end of `render`, after the not-checked `details`, the judged section:

```ts
    const store = this.plugin.judged;
    const groups = judgedGroups(store, (p) => this.plugin.files.get(p) ?? null);
    if (store.last || groups.length) {
      const section = el.createDiv({ cls: "companygraph-judged-section" });
      section.createDiv({ cls: "companygraph-judged-title", text: "Writing rules, judged by Claude Code" });
      if (!groups.length) section.createDiv({ cls: "companygraph-pane-note", text: "No breach was judged." });
      for (const group of groups) {
        const file = section.createDiv({ cls: `companygraph-file${group.stale ? " is-stale" : ""}` });
        const head = file.createDiv({ cls: "companygraph-file-head" });
        head.createDiv({ cls: "companygraph-file-name", text: group.path ?? "The instance" });
        if (group.stale) head.createSpan({ cls: "companygraph-stale", text: "judged an earlier version" });
        const list = file.createEl("ul");
        for (const j of group.judgments) {
          const item = list.createEl("li");
          if (group.path) item.createSpan({ cls: "companygraph-line", text: j.placed === "line" ? `${j.line + 1}` : "·" });
          const words = item.createDiv({ cls: "companygraph-message" });
          words.createDiv({ cls: "companygraph-judged-rule", text: j.rule });
          words.createDiv({ text: group.path ? j.judgment : `${j.path}: ${j.judgment}` });
          if (group.path) {
            item.addClass("companygraph-open");
            item.onClickEvent(() => {
              if (activeWindow.getSelection()?.toString()) return;
              void this.openAt(group.path!, j.line);
            });
          }
        }
      }
      if (store.gaps.length) {
        const gaps = section.createEl("details", { cls: "companygraph-not-checked" });
        gaps.createEl("summary", { text: `Gaps · ${store.gaps.length}` });
        const ul = gaps.createEl("ul");
        for (const g of store.gaps) ul.createEl("li", { text: `${g.profile}: ${g.role} requires ${g.skill}` });
      }
      if (store.notJudged.length) {
        const not = section.createEl("details", { cls: "companygraph-not-checked" });
        not.createEl("summary", { text: `Not judged · ${store.notJudged.length}` });
        const ul = not.createEl("ul");
        for (const line of store.notJudged) ul.createEl("li", { text: line });
      }
      const last = store.last;
      if (last) {
        const when = new Date(last.at).toLocaleString();
        const cost = last.cost === null ? "" : ` · $${last.cost.toFixed(2)}`;
        const denied = last.denied.length ? ` · refused: ${last.denied.join(", ")}` : "";
        section.createDiv({ cls: "companygraph-banner-sub", text: `Last run: ${last.scope === "note" ? last.path : "the instance"}, ${when}, ${last.seconds} s${cost}${denied}` });
      }
    }
```

- [ ] **Step 8: Styles**, appended to `styles.css`:

```css
/* A line the agent judged: a quiet amber, apart from a failure's red. */
.companygraph-judged {
  background-color: rgba(var(--color-yellow-rgb), 0.1);
}

/* The agent pass in the checks pane: the run under way, and the judgments below the failures. */
.companygraph-run {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4-2);
  margin-top: var(--size-4-3);
  padding: var(--size-4-2) var(--size-4-3);
  border-radius: var(--radius-m);
  background-color: rgba(var(--color-yellow-rgb), 0.1);
  font-size: var(--font-ui-small);
}

.companygraph-judged-section {
  margin-top: var(--size-4-6);
  padding-top: var(--size-4-3);
  border-top: 1px solid var(--background-modifier-border);
}

.companygraph-judged-title {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  font-weight: var(--font-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.companygraph-judged-rule {
  color: var(--text-normal);
  font-style: italic;
}

.companygraph-file.is-stale {
  opacity: 0.55;
}

.companygraph-stale {
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
}
```

- [ ] **Step 9: Typecheck, test, build, check the bundle**

Run: `npm run typecheck && npm test && npm run build && ! grep -q 'require("child_process")' main.js && echo clean`
Expected: every test passes; `clean`.

- [ ] **Step 10: Commit** `src/judgedview.ts`, `src/judgedmarks.ts`, `src/pane.ts`, `src/main.ts`, `styles.css`, `test/judgedview.test.ts`.

---

### Task 6: The spec's status, the README, and the trial checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-agent-pass-design.md` (Status line: built, not yet tried)
- Modify: `README.md` (one paragraph on the two commands and the settings)
- Create: `docs/superpowers/plans/2026-09-19-agent-pass-trial-checklist.md`

- [ ] **Step 1:** In the design note, change "nothing built" in the Status paragraph to "built as planned in `docs/superpowers/plans/2026-09-19-agent-pass.md`, not yet tried in Obsidian".

- [ ] **Step 2:** In `README.md`, beside what the plugin does, add a paragraph: the two commands, that they start Claude Code in the background read-only, that judgments are shown apart from failures and kept in the plugin's data, that each run costs what the agent costs and says so, and that the program's path and model are in the plugin's settings. Keep the README's register.

- [ ] **Step 3:** Write the trial checklist with these steps, each a question, in the form of the earlier checklists in `docs/superpowers/plans/`:
  1. Settings → CompanyGraph: the Claude Code field empty; run "Judge this note" on `model/roles/writer.md`: does the pane show the run with a clock and Cancel?
  2. When it ends: a "Writing rules, judged by Claude Code" section below the failures, entries with a line, the rule in italics and the judgment; the last run's time, seconds and cost.
  3. The judged lines in the editor carry an amber mark with the tooltip; the status bar says `N judged`.
  4. Edit the note: its judgments grey as "judged an earlier version", the marks go, the status bar says `(N stale)`.
  5. Run it again and press Cancel: "cancelled; nothing was stored", and the earlier judgments stay.
  6. Set the Claude Code path to a wrong path: the command says so.
  7. Reload Obsidian: the judgments are still there.
  8. Run "Judge the instance" once, before a commit: every judged file is listed, the gaps and what was not judged folded, the cost shown.
  9. Rename a judged note: its judgments follow it.

- [ ] **Step 4:** Run `sh conventions/conventions-check`, then commit the three files.

---

## Self-review

- **Spec coverage.** What is judged: Task 1's prompt. Decisions: background (Tasks 3-4), two scopes (Task 4 commands), plugin data and staleness (Tasks 2, 4, 5), pane plus amber mark plus status count (Task 5). The command line: Task 3 `argsFor`. Finding the program: Task 3 `findProgram`, Task 4 settings. While it runs: Task 4 cancel and timeouts, Task 5 the pane's clock and Cancel. When it ends: Task 1 `readAnswer` (loose and instance placement, unreadable answers), Task 4 failures storing nothing, Task 5 duration and cost. Stored, stale, shown: Tasks 2 and 5. Rename and delete: Task 4. Units and testing: Tasks 1-3 with the stand-in. Desktop only: Task 4 `Platform.isDesktop`.
- **Types.** `Scope`, `Judgment`, `Answer`, `RunInfo` from Task 1 are consumed with the same names in Tasks 2, 4 and 5; `Store`, `recordRun`, `renamedIn`, `removedFrom`, `storeFrom`, `isStale`, `countsOf` from Task 2 in Tasks 4 and 5; `Spawn`, `run`, `argsFor`, `findProgram` from Task 3 in Task 4.
