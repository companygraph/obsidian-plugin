import test from "node:test";
import assert from "node:assert/strict";
import { briefOf, lineOf, partsOf, placeAt } from "../src/brief.ts";
import { schemaKeyOf, schemasOf } from "../src/model.ts";
import { reference, withSoftware, WITH_SOFTWARE } from "./helpers.ts";

const role = reference().get("meta/core/role-schema.md")!;
const decision = reference().get("meta/core/decision-schema.md")!;

test("a section's brief is its row of the sections table, the type's purpose and its writing rules", () => {
  const b = briefOf(role, { kind: "section", heading: "What it never does" });
  assert.equal(b.label, "Section");
  assert.equal(b.name, "What it never does");
  assert.equal(b.required, true);
  assert.match(b.description!, /refuses whoever holds it/);
  assert.match(b.purpose!.lead, /^A role is a seat/);
  // The rule that names the section comes first, and every rule is there.
  assert.ok(b.rules[0].names);
  assert.match(b.rules[0].text, /## What it never does/);
  assert.equal(b.rules.filter((r) => r.names).length, 1);
  assert.ok(b.rules.length >= 5);
  // A rule written over several lines reads as one.
  assert.ok(b.rules.some((r) => r.text.startsWith("Person-neutral:") && r.text.includes("Who holds it is the profile's fact.")));
});

test("a field's brief is its row of the frontmatter table, and the rules that name it first", () => {
  const b = briefOf(role, { kind: "field", name: "requires" });
  assert.equal(b.label, "Field");
  assert.equal(b.name, "requires");
  assert.equal(b.required, false);
  assert.match(b.description!, /The skills the seat needs/);
  assert.ok(b.rules[0].names && b.rules[0].text.startsWith("`requires`"));
});

test("above every section, the brief is the H1's row, and on the tagline the tagline's", () => {
  const top = briefOf(role, { kind: "top" });
  assert.deepEqual([top.label, top.name], ["Title", "Seat"]);
  const tagline = briefOf(role, { kind: "tagline" });
  assert.deepEqual([tagline.label, tagline.name], ["Tagline", "Purpose"]);
  assert.match(tagline.description!, /what the seat is for/);
});

test("a section the schema does not declare has no row, and still the purpose and every rule", () => {
  const b = briefOf(role, { kind: "section", heading: "Notes" });
  assert.equal(b.description, null);
  assert.equal(b.required, null);
  assert.ok(b.purpose && b.rules.length > 0);
});

test("the place of a line: a field, a list's entry, a section, the H1 part or the tagline", () => {
  const lines = ["---", "source: Local", "requires:", "  - Writing", "---", "", "# Writer", "", "> Writes.", "", "## What it takes", "", "A brief."];
  assert.deepEqual(placeAt(lines, 1), { kind: "field", name: "source" });
  assert.deepEqual(placeAt(lines, 3), { kind: "field", name: "requires" });
  assert.equal(placeAt(lines, 0), null);
  assert.equal(placeAt(lines, 4), null);
  assert.deepEqual(placeAt(lines, 6), { kind: "top" });
  assert.deepEqual(placeAt(lines, 8), { kind: "tagline" });
  assert.deepEqual(placeAt(lines, 12), { kind: "section", heading: "What it takes" });
});

test("a section names a rule only where its heading ends: `## Skill` is not `## Skills`", () => {
  const schema = "# X Schema\n\n## Purpose\n\nP.\n\n## Writing rules\n\n- `## Skills` rows are claims.\n- Other.\n";
  assert.equal(briefOf(schema, { kind: "section", heading: "Skill" }).rules.filter((r) => r.names).length, 0);
  assert.equal(briefOf(schema, { kind: "section", heading: "Skills" }).rules.filter((r) => r.names).length, 1);
});

test("a comment line in the frontmatter belongs to the field above it", () => {
  const lines = ["---", "source: Local", "# a note to self", "---", "# A"];
  assert.deepEqual(placeAt(lines, 2), { kind: "field", name: "source" });
  // Above every field there is no field to name, and the brief is the page's.
  assert.deepEqual(placeAt(["---", "# first", "source: Local", "---"], 1), { kind: "top" });
});

test("a rule reads by names: a section and a field as themselves, other code as code, a quote as an example", () => {
  const parts = partsOf('`## Why` and `decided` hold, `Why not` too, never "the topic".', new Set(["decided"]));
  assert.deepEqual(parts, [
    { kind: "section", text: "Why" },
    { kind: "text", text: " and " },
    { kind: "field", text: "decided" },
    { kind: "text", text: " hold, " },
    { kind: "code", text: "Why not" },
    { kind: "text", text: " too, never " },
    { kind: "example", text: '"the topic"' },
    { kind: "text", text: "." },
  ]);
  // A name the frontmatter does not declare is not a field.
  assert.equal(partsOf("`status`", new Set())[0].kind, "code");
});

test("the rules that do not name the place fold under the place each names first, in the page's order", () => {
  const b = briefOf(decision, { kind: "section", heading: "Why" });
  const keys = b.groups.map((g) => g.key);
  // The H1 and the statement come first, the sections as the schema lists them, then the
  // frontmatter and the page; the place's own section is not among them.
  assert.deepEqual(keys.slice(0, 2), ["title", "tagline"]);
  assert.ok(!keys.includes("## Why"));
  assert.ok(keys.indexOf("## Alternatives") < keys.indexOf("## Consequences"));
  assert.deepEqual(keys.slice(-2), ["frontmatter", "page"]);
  // `## The question` names `## Why` too, so it is a rule for this place and in no group.
  assert.ok(b.rules.filter((r) => r.names).some((r) => r.text.startsWith("`## The question`")));
  // Every rule is either for this place or in one group.
  assert.equal(b.rules.filter((r) => r.names).length + b.groups.reduce((n, g) => n + g.rules.length, 0), b.rules.length);
  const front = b.groups.find((g) => g.key === "frontmatter")!;
  assert.deepEqual([front.label, front.name], ["Fields", "Frontmatter"]);
  assert.ok(front.rules.some((r) => r.text.startsWith("`decided`")));
});

test("the H1 is named by that word and the tagline by the name its row gives it", () => {
  const top = briefOf(decision, { kind: "top" });
  assert.equal(top.name, "Decision");
  assert.ok(top.rules[0].names && top.rules[0].text.startsWith("The H1"));
  const tagline = briefOf(decision, { kind: "tagline" });
  assert.equal(tagline.name, "Statement");
  assert.ok(tagline.rules[0].names && tagline.rules[0].text.startsWith("The statement"));
});

test("a field carries its type, a table section its columns, the purpose its first sentence apart", () => {
  assert.equal(briefOf(decision, { kind: "field", name: "decided" }).type, "date");
  assert.deepEqual(briefOf(decision, { kind: "section", heading: "Alternatives" }).columns, ["Option", "Why not"]);
  assert.deepEqual(briefOf(decision, { kind: "section", heading: "Why" }).columns, []);
  const { purpose } = briefOf(decision, { kind: "top" });
  assert.match(purpose!.lead, /^A decision is a call .* rather than a rewrite\.$/);
  assert.match(purpose!.rest, /^It answers/);
});

test("the line a place is on, and none where the page lacks it", () => {
  const lines = ["---", "decided: 2026", "by: Architect", "---", "", "# A call", "", "> I call it.", "", "## Why", "", "Because."];
  assert.equal(lineOf(lines, { kind: "field", name: "by" }), 2);
  assert.equal(lineOf(lines, { kind: "title" }), 5);
  assert.equal(lineOf(lines, { kind: "tagline" }), 7);
  assert.equal(lineOf(lines, { kind: "section", name: "Why" }), 9);
  assert.equal(lineOf(lines, { kind: "section", name: "Alternatives" }), null);
  assert.equal(lineOf(lines, { kind: "field", name: "serves" }), null);
  // A `>` line under a section is a quote, not the tagline.
  assert.equal(lineOf(["# A", "", "## Why", "> quoted"], { kind: "tagline" }), null);
});

test("the brief of a pack type is made from the pack's schema, found by its type", () => {
  const schemas = schemasOf(withSoftware(), WITH_SOFTWARE);
  const schema = schemas.get(schemaKeyOf("bounded-context", WITH_SOFTWARE)!)!;
  assert.ok(schema);
  const b = briefOf(schema, { kind: "field", name: "classification" });
  assert.equal(b.name, "classification");
  assert.match(b.description!, /core.*supporting.*generic/);
});
