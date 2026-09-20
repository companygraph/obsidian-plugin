import test from "node:test";
import assert from "node:assert/strict";
import { checkInstance } from "companygraph-meta-model/checks";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { scaffoldOf, targetsFor } from "../src/scaffold.ts";
import { example, EXAMPLE, reference, REFERENCE } from "./helpers.ts";

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
  // A start the date check would refuse gives no file, though it opens with a year.
  for (const bad of ["2031-4", "2031/04", "2031abc", "31-04"]) assert.equal(experience.pathFor("UBS Trainee", bad), null, bad);
  for (const good of ["2031", "2031-04", "2031-04-30"]) assert.ok(experience.pathFor("UBS Trainee", good), good);
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

test("what a new entity still owes is said: an owner's first owned entity, an owned one's row", () => {
  const targets = byType(targetsFor(MODEL, "model/processes/delivery/phases/plan.md", none));
  // A process owns two collections, and the checks want a folder for each: the notice names
  // both, joined as two things owed and not as a choice between them.
  assert.match(targets.get("process")!.owes!, /its first phase and its first track/);
  assert.match(targets.get("phase")!.owes!, /process lists/);
  assert.match(targets.get("track")!.owes!, /process lists/);
  assert.equal(targets.get("skill")!.owes, null);
});

test("every type scaffolded into the reference instance owes only what its notice says", () => {
  // From inside an owner of each kind, so every type is offered once. What the checks may then
  // say of a new entity is what the scaffold leaves to its author: a required list with no item
  // yet, an owner's folder with nothing owned in it, an owner's table that does not list it.
  const files = reference();
  const refVocabulary = vocabularyOf(schemasOf(files, REFERENCE));
  const expected = [/carries no items/, /is missing (phases|tracks|experiences)\//, /does not list/];
  const seen = new Set<string>();
  for (const active of ["model/processes/delivery/delivery.md", "model/profiles/robert-blust/robert-blust.md"]) {
    for (const target of targetsFor(REFERENCE.model, active, (p) => files.has(p))) {
      if (seen.has(target.type) || !refVocabulary.has(target.type)) continue;
      seen.add(target.type);
      const trial = new Map(files);
      const path = target.pathFor("Zeta Probe Thing", "2031-04")!;
      trial.set(path, scaffoldOf(refVocabulary.get(target.type)!, "Zeta Probe Thing", target.asks ? { [target.asks]: "2031-04" } : {}).text);
      const unexpected = checkInstance(trial, REFERENCE).failures.filter((f) => !expected.some((e) => e.test(f)));
      assert.deepEqual(unexpected, [], target.type);
    }
  }
  assert.ok(seen.has("phase") && seen.has("track") && seen.has("experience") && seen.has("process"));
});
