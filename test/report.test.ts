import test from "node:test";
import assert from "node:assert/strict";
import { groupsOf, noSchemaFor, reportText } from "../src/report.ts";

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

test("a type the vendored core carries no schema for is said, and nothing is said otherwise", () => {
  assert.equal(noSchemaFor([]), null);
  assert.match(noSchemaFor(["skill"])!, /no schema for skill, so nothing holds that type/);
  assert.match(noSchemaFor(["skill", "role"])!, /skill, role, so nothing holds those types/);
});

test("the report as text says what the pane says, with lines a person counts from one", () => {
  const text = reportText({ status: "checked", notice: null, located, skipped: [] });
  assert.ok(text.startsWith("CompanyGraph, meta-model compliance: 3 failures\n"));
  assert.ok(text.includes("\nmodel/roles/writer.md\n- line 2: `source` says \"Nowhere\"\n- line 5: skill \"Cobol\" resolves to nothing\n"));
  assert.ok(text.includes("\nThe instance\n- two skill files share the canonical name \"Java\"\n"));
  assert.ok(text.trimEnd().endsWith("- two skill files share the canonical name \"Java\""));
  assert.ok(!/not checked/i.test(text));
});

test("a picture's failure has no line, since a picture has none to point to", () => {
  const withPicture = [
    { path: "model/profiles/robert-blust/picture.jpg", line: 0, message: "is a PNG named as a JPEG (R9)" },
  ];
  const text = reportText({ status: "checked", notice: null, located: withPicture, skipped: [] });
  assert.ok(text.includes("\nmodel/profiles/robert-blust/picture.jpg\n- is a PNG named as a JPEG (R9)\n"), text);
  assert.ok(!text.includes("- line"), text);
});

test("a type with no schema is named in the copied report, after the failures", () => {
  const text = reportText({ status: "checked", notice: null, located: [], skipped: ["skill"] });
  assert.ok(text.trimEnd().endsWith("so nothing holds that type."));
});

test("a clean report, a notice, and the states in which nothing was checked", () => {
  assert.ok(reportText({ status: "checked", notice: "the pin differs", located: [], skipped: [] })
    .startsWith("CompanyGraph, meta-model compliance: the instance complies with the meta-model\nthe pin differs\n"));
  assert.equal(reportText({ status: "refused", notice: "core is newer", located: [], skipped: [] }), "CompanyGraph, meta-model compliance: not checked\ncore is newer\n");
  assert.equal(reportText({ status: "checking", notice: null, located: [], skipped: [] }), "CompanyGraph, meta-model compliance: checking\n");
  assert.ok(reportText({ status: "idle", notice: null, located: [], skipped: [] }).includes("not an instance"));
});
