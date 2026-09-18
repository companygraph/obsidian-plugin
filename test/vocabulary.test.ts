import test from "node:test";
import assert from "node:assert/strict";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
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
  assert.deepEqual(skills.columns!.map((c) => c.name), ["Skill", "Level", "Evidence"]);
  assert.deepEqual(skills.columns![0].offer, { kind: "names", target: "skill" });
  assert.equal(vocabulary.get("skill")!.sections.find((s) => s.heading === "In practice")!.columns, null);
});
