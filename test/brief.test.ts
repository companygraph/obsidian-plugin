import test from "node:test";
import assert from "node:assert/strict";
import { briefOf, placeAt } from "../src/brief.ts";
import { reference } from "./helpers.ts";

const role = reference().get("meta/core/role-schema.md")!;

test("a section's brief is its row of the sections table, the type's purpose and its writing rules", () => {
  const b = briefOf(role, { kind: "section", heading: "What it never does" });
  assert.equal(b.place, "## What it never does");
  assert.equal(b.required, true);
  assert.match(b.description!, /refuses whoever holds it/);
  assert.match(b.purpose!, /^A role is a seat/);
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
  assert.equal(b.place, "requires");
  assert.equal(b.required, false);
  assert.match(b.description!, /The skills the seat needs/);
  assert.ok(b.rules[0].names && b.rules[0].text.startsWith("`requires`"));
});

test("above every section, the brief is the H1's row, and on the tagline the tagline's", () => {
  assert.equal(briefOf(role, { kind: "top" }).place, "# [Seat]");
  const tagline = briefOf(role, { kind: "tagline" });
  assert.equal(tagline.place, "> [Purpose]");
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
