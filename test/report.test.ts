import test from "node:test";
import assert from "node:assert/strict";
import { groupsOf, notChecked, reportText } from "../src/report.ts";

const located = [
  { path: "model/roles/writer.md", line: 1, message: "`source` says \"Nowhere\"" },
  { path: null, line: 0, message: "two skill files share the canonical name \"Java\"" },
  { path: "model/roles/writer.md", line: 4, message: "skill \"Cobol\" resolves to nothing" },
];

test("failures are grouped by file in the order files first appear, the instance's own among them", () => {
  const groups = groupsOf(located);
  assert.deepEqual(groups.map((g) => g.title), ["model/roles/writer.md", "The instance"]);
  assert.equal(groups[0].entries.length, 2);
});

test("what was not checked names the skipped types and always the writing rules", () => {
  assert.deepEqual(notChecked([]), ["every ## Writing rules in every schema: that is the agent pass, R0"]);
  assert.equal(notChecked(["skill"]).length, 2);
  assert.ok(notChecked(["skill"])[0].startsWith("skill: "));
});

test("the report as text says what the pane says, with lines a person counts from one", () => {
  const text = reportText({ status: "checked", notice: null, located, skipped: [] });
  assert.ok(text.startsWith("CompanyGraph, meta-model compliance: 3 failures\n"));
  assert.ok(text.includes("\nmodel/roles/writer.md\n- line 2: `source` says \"Nowhere\"\n- line 5: skill \"Cobol\" resolves to nothing\n"));
  assert.ok(text.includes("\nThe instance\n- two skill files share the canonical name \"Java\"\n"));
  assert.ok(text.trimEnd().endsWith("- every ## Writing rules in every schema: that is the agent pass, R0"));
});

test("a clean report, a notice, and the states in which nothing was checked", () => {
  assert.ok(reportText({ status: "checked", notice: "the pin differs", located: [], skipped: [] })
    .startsWith("CompanyGraph, meta-model compliance: the instance complies with the meta-model\nthe pin differs\n"));
  assert.equal(reportText({ status: "refused", notice: "core is newer", located: [], skipped: [] }), "CompanyGraph, meta-model compliance: not checked\ncore is newer\n");
  assert.equal(reportText({ status: "checking", notice: null, located: [], skipped: [] }), "CompanyGraph, meta-model compliance: checking\n");
  assert.ok(reportText({ status: "idle", notice: null, located: [], skipped: [] }).includes("not an instance"));
});
