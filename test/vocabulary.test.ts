import test from "node:test";
import assert from "node:assert/strict";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { ownerTypesOf } from "companygraph-meta-model/instance";
import { example, EXAMPLE } from "./helpers.ts";

const vocabulary = vocabularyOf(schemasOf(example(), EXAMPLE));

test("a reference field offers the names of the type it declares", () => {
  const source = vocabulary.get("skill")!.fields.find((f) => f.name === "source")!;
  assert.deepEqual(source, { name: "source", required: true, list: false, offer: { kind: "names", target: "source" } });
});

test("an enum field offers the values its description opens with", () => {
  const nature = vocabulary.get("profile")!.fields.find((f) => f.name === "nature")!;
  assert.deepEqual(nature.offer, { kind: "values", values: ["human", "agent"] });
});

test("a list of references is a list", () => {
  const roles = vocabulary.get("profile")!.fields.find((f) => f.name === "roles")!;
  assert.equal(roles.list, true);
  assert.deepEqual(roles.offer, { kind: "names", target: "role" });
});

test("a string field offers nothing", () => {
  assert.deepEqual(vocabulary.get("skill")!.fields.find((f) => f.name === "group")!.offer, { kind: "none" });
});

test("sections are the `## ` rows of the index table, and a table section carries its columns", () => {
  const profile = vocabulary.get("profile")!;
  assert.ok(!profile.sections.some((s) => s.heading.startsWith("#")));
  const skills = profile.sections.find((s) => s.heading === "Skills")!;
  assert.deepEqual(skills.columns!.map((c) => c.name), ["Skill", "Level"]);
  assert.deepEqual(skills.columns![0].offer, { kind: "names", target: "skill" });
  // Core 0.30.0: the facts under a claim are a table of their own, and its last column is a
  // qualifier, which offers the names of its type as a reference does.
  const evidence = profile.sections.find((s) => s.heading === "Evidence")!;
  assert.deepEqual(evidence.columns!.map((c) => c.name), ["Skill", "What it shows", "Experience"]);
  assert.deepEqual(evidence.columns!.map((c) => c.offer.kind), ["names", "none", "names"]);
  assert.deepEqual(evidence.columns![2].offer, { kind: "names", target: "experience" });
  assert.equal(vocabulary.get("skill")!.sections.find((s) => s.heading === "In practice")!.columns, null);
});

// Core 0.40.0 (meta-model v0.45.0): `ref → by <Column> in <Owner>` reads the type of the name from
// the row, and the owner too where that type is owned (R4, R9). The two columns it reads are
// declared `string`, and what they hold is read from the declaration that reads them.
const REFERENCE_BY = "ref → by Type in Owner";

test("a question's Rests on reads its entity's type and owner from the row", () => {
  const schemas = schemasOf(example(), EXAMPLE);
  const rests = vocabulary.get("question")!.sections.find((s) => s.heading === "Rests on")!;
  assert.deepEqual(rests.columns, [
    { name: "Type", offer: { kind: "types", types: [...vocabulary.keys()].sort((a, b) => a.localeCompare(b)) } },
    { name: "Entity", offer: { kind: "by", by: "Type", in: "Owner", schemas } },
    { name: "Owner", offer: { kind: "owner", by: "Type", owners: ownerTypesOf(schemas) } },
    { name: "For", offer: { kind: "none" } },
  ]);
  const owner = rests.columns![2].offer;
  assert.ok(owner.kind === "owner" && owner.owners.get("experience") === "profile" && !owner.owners.has("feature"));
});

test("a `by` with no `in` leaves the owner column a string, and a `by` on a field offers nothing", () => {
  const schemas = schemasOf(example(), EXAMPLE);
  const question = schemas.get("question-schema.md")!;
  assert.ok(question.includes(REFERENCE_BY) && question.includes("| `source-id` | No | string |"));
  const bare = vocabularyOf(new Map(schemas).set("question-schema.md", question.replace(REFERENCE_BY, "ref → by Type")));
  const rests = bare.get("question")!.sections.find((s) => s.heading === "Rests on")!;
  assert.deepEqual(rests.columns!.map((c) => c.offer.kind), ["types", "by", "none", "none"]);
  assert.ok(rests.columns![1].offer.kind === "by" && rests.columns![1].offer.in === null);
  const field = vocabularyOf(new Map(schemas).set("question-schema.md", question.replace("| `source-id` | No | string |", "| `source-id` | No | ref → by Type |")));
  assert.deepEqual(field.get("question")!.fields.find((f) => f.name === "source-id")!.offer, { kind: "none" });
});
