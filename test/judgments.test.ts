import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY, countsOf, hashOf, isStale, recordRun, removedFrom, renamedIn, storeFrom } from "../src/judgments.ts";
import type { Answer, Judgment } from "../src/agent.ts";

const j = (path: string, line: number, placed: Judgment["placed"] = "line"): Judgment =>
  ({ path, line, type: "role", rule: "R", judgment: "J", placed });
const answer = (judgments: Judgment[]): Answer => ({ judgments, gaps: [{ profile: "P", role: "R", skill: "S" }], notJudged: ["n"] });
const info = { cost: 0.4, turns: 3, denied: [] };
const meta = { at: "2026-09-19T20:00:00Z", seconds: 42, model: null, program: "/opt/homebrew/bin/claude" };
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
  assert.equal(second.last!.program, "/opt/homebrew/bin/claude");
});

test("a note run's own judgment placed under the instance is not stored, only the last instance run's", () => {
  const first = recordRun(EMPTY, { kind: "instance", model: "model" }, answer([j("model/x.md", 0, "instance")]), info, texts, meta);
  assert.equal(first.instance.length, 1);
  const second = recordRun(first, { kind: "note", path: "model/a.md" }, answer([j("model/nowhere.md", 0, "instance")]), info, texts, meta);
  assert.deepEqual(second.instance, first.instance);
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

test("a saved entry, entry list, or last run that does not validate is dropped rather than tainting the rest", () => {
  assert.deepEqual(storeFrom({ entries: { a: null } }).entries, {});
  assert.deepEqual(storeFrom({ entries: { a: { hash: "h", judgments: "no" } } }).entries, {});
  assert.equal(storeFrom({ entries: {}, last: "junk" }).last, null);
  assert.deepEqual(storeFrom({ entries: {}, instance: [1] }).instance, []);
});
