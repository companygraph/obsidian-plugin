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

test("a top-level answer that is not an object, or a judgment or gap that is not one, is refused and never throws", () => {
  const notAnObject = readAnswer("null", lines({}));
  assert.ok(!notAnObject.ok && /shape/.test(notAnObject.why));
  const nullJudgment = readAnswer(envelope({ judgments: [null], gaps: [], notJudged: [] }), lines({}));
  assert.ok(!nullJudgment.ok && /shape/.test(nullJudgment.why));
  const nullGap = readAnswer(envelope({ judgments: [], gaps: [null], notJudged: [] }), lines({}));
  assert.ok(!nullGap.ok && /shape/.test(nullGap.why));
});

test("a denied tool is said", () => {
  const read = readAnswer(
    envelope({ judgments: [], gaps: [], notJudged: [] }, { permission_denials: [{ tool_name: "Bash" }, { tool_name: "Write" }] }),
    lines({}),
  );
  assert.ok(read.ok);
  assert.deepEqual(read.info.denied, ["Bash", "Write"]);
});
