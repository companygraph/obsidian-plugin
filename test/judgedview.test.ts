import test from "node:test";
import assert from "node:assert/strict";
import { judgedGroups } from "../src/judgedview.ts";
import { EMPTY, recordRun } from "../src/judgments.ts";
import type { Judgment } from "../src/agent.ts";

const j = (path: string, line: number, placed: Judgment["placed"] = "line"): Judgment => ({ path, line, type: "role", rule: "R", judgment: "J", placed });
const texts = new Map([["model/a.md", "# A\n"], ["model/b.md", "# B\n"]]);
const store = recordRun(EMPTY, { kind: "instance", model: "model" }, { judgments: [j("model/b.md", 3), j("model/b.md", 1), j("model/a.md", 0), j("x.md", 0, "instance")], gaps: [], notJudged: [] }, { cost: null, turns: null, denied: [] }, texts, { at: "t", seconds: 1, model: null, program: "/opt/homebrew/bin/claude" });

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
