import test from "node:test";
import assert from "node:assert/strict";
import { checkInstance } from "companygraph-meta-model/checks";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { scaffoldOf, targetsFor } from "../src/scaffold.ts";
import { example, EXAMPLE } from "./helpers.ts";

const vocabulary = vocabularyOf(schemasOf(example(), EXAMPLE));
const MODEL = "model";
const none = () => false;
const byType = (targets: ReturnType<typeof targetsFor>) => new Map(targets.map((t) => [t.type, t]));

test("a type in a folder of its own takes the slug of its name", () => {
  const skill = byType(targetsFor(MODEL, null, none)).get("skill")!;
  assert.equal(skill.where, "model/skills/");
  assert.equal(skill.pathFor("Domain-Driven Design"), "model/skills/domain-driven-design.md");
  assert.equal(skill.pathFor("  "), null);
});

test("an owner takes a folder of its name with its file inside", () => {
  const process = byType(targetsFor(MODEL, null, none)).get("process")!;
  assert.equal(process.where, "model/processes/");
  assert.equal(process.pathFor("Delivery"), "model/processes/delivery/delivery.md");
});

test("an owned type is offered only from inside an owner, and goes into that owner", () => {
  assert.ok(!byType(targetsFor(MODEL, "model/skills/java.md", none)).has("phase"));
  const phase = byType(targetsFor(MODEL, "model/processes/delivery/phases/plan.md", none)).get("phase")!;
  assert.equal(phase.pathFor("Review"), "model/processes/delivery/phases/review.md");
  const fromOwner = byType(targetsFor(MODEL, "model/processes/delivery/delivery.md", none)).get("phase")!;
  assert.equal(fromOwner.where, "model/processes/delivery/phases/");
  // A process note is in no profile, so no experience is offered from it.
  assert.ok(!byType(targetsFor(MODEL, "model/processes/delivery/delivery.md", none)).has("experience"));
});

test("an experience asks for its start, whose year leads its filename", () => {
  const experience = byType(targetsFor(MODEL, "model/profiles/robert-blust/robert-blust.md", none)).get("experience")!;
  assert.equal(experience.asks, "start");
  assert.equal(experience.pathFor("UBS Trainee", "1999-08"), "model/profiles/robert-blust/experiences/1999-ubs-trainee.md");
  assert.equal(experience.pathFor("UBS Trainee", "August"), null);
});

test("a singular type is offered only while its file does not exist", () => {
  assert.equal(byType(targetsFor(MODEL, null, none)).get("vision")!.pathFor("x"), "model/vision.md");
  assert.ok(!byType(targetsFor(MODEL, null, (p) => p === "model/vision.md")).has("vision"));
});

test("a new entity starts with its required fields, its H1, an empty tagline and its required sections", () => {
  const role = vocabulary.get("role")!;
  const { text, tagline } = scaffoldOf(role, "Critic", { source: "Local" });
  const lines = text.split("\n");
  assert.equal(lines[tagline], "> ");
  assert.ok(text.includes("source: Local\n"));
  assert.ok(text.includes("# Critic\n"));
  const headings = lines.filter((l) => l.startsWith("## "));
  assert.deepEqual(headings, role.sections.filter((s) => s.required).map((s) => `## ${s.heading}`));
  assert.ok(!text.includes("## References"));
});

test("a required table section starts with its header", () => {
  const process = vocabulary.get("process")!;
  const phases = process.sections.find((s) => s.heading === "Phases")!;
  assert.ok(phases.required && phases.columns);
  const { text } = scaffoldOf(process, "Hiring");
  assert.ok(text.includes("## Phases\n\n| Phase |\n| --- |\n"));
});

test("a scaffold written into the example passes the checks as a page", () => {
  // A role requires three sections; its scaffold carries them, under the name R12 derives.
  const role = vocabulary.get("role")!;
  const files = example();
  const path = byType(targetsFor(EXAMPLE.model, null, (p) => files.has(p))).get("role")!.pathFor("Critic")!;
  assert.equal(path, "example/model/roles/critic.md");
  files.set(path, scaffoldOf(role, "Critic", { source: "Local" }).text);
  assert.deepEqual(checkInstance(files, EXAMPLE).failures.filter((f) => f.startsWith(path)), []);
  // And without the scaffold's sections, the same page fails for each.
  files.set(path, "---\nsource: Local\n---\n\n# Critic\n\n> \n");
  assert.equal(checkInstance(files, EXAMPLE).failures.filter((f) => f.startsWith(path) && f.includes("`## ")).length, 3);
});
