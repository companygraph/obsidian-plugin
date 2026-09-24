import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { namedOf } from "../src/scope.ts";
import { countOf, referencesFor } from "../src/refs.ts";
import { example, EXAMPLE, reference, REFERENCE } from "./helpers.ts";

const worldOf = (files: Map<string, string>, layout: typeof EXAMPLE) => ({
  files,
  vocabulary: vocabularyOf(schemasOf(files, layout)),
  named: namedOf(buildModel(files, layout).graph!),
  model: layout.model,
});
const world = worldOf(example(), EXAMPLE);

test("what names a skill is grouped by the file it is written in, each saying what declares it", () => {
  const refs = referencesFor(world, "example/model/skills/java-programming.md");
  assert.deepEqual(refs.in.map((g) => g.path), [
    "example/model/profiles/mira-halvorsen/experiences/2018-northwind-atelier.md",
    "example/model/profiles/mira-halvorsen/experiences/2022-beacon-systems.md",
    "example/model/profiles/mira-halvorsen/mira-halvorsen.md",
    "example/model/profiles/tomas-reyes/tomas-reyes.md",
    "example/model/roles/backend-engineer.md",
  ]);
  const role = refs.in.find((g) => g.path.endsWith("backend-engineer.md"))!;
  assert.deepEqual(role.mentions.map((m) => [m.declared, m.name]), [["requires", "Java Programming"]]);
  const profile = refs.in.find((g) => g.path.endsWith("mira-halvorsen.md"))!;
  assert.ok(profile.mentions.some((m) => m.declared === "## Skills · Skill"));
  assert.ok(profile.mentions.some((m) => m.declared === "## Evidence · Skill"));
  // A skill names nothing but its source.
  assert.deepEqual(refs.out.map((g) => g.path), ["example/model/sources/local.md"]);
});

test("what an entity names is grouped by the file it points at, in line order", () => {
  const refs = referencesFor(world, "example/model/profiles/mira-halvorsen/mira-halvorsen.md");
  assert.ok(countOf(refs.out) > countOf(refs.in));
  const java = refs.out.find((g) => g.path.endsWith("java-programming.md"))!;
  assert.deepEqual(java.mentions.map((m) => m.line), [...java.mentions.map((m) => m.line)].sort((a, b) => a - b));
  for (const group of refs.out) for (const m of group.mentions) assert.equal(m.path, "example/model/profiles/mira-halvorsen/mira-halvorsen.md");
});

test("a grouped heading names its kind, and says the section it heads", () => {
  const files = reference();
  const refWorld = worldOf(files, REFERENCE);
  const kind = refWorld.named.find((n) => n.type === "achievement-kind")!;
  const refs = referencesFor(refWorld, kind.path);
  assert.ok(countOf(refs.in) > 0);
  assert.ok(refs.in.every((g) => g.mentions.every((m) => m.declared.startsWith("## "))));
});

test("an owned name is read within its owner, so another owner's phase is no reference here", () => {
  const files = reference();
  const refWorld = worldOf(files, REFERENCE);
  const phase = refWorld.named.find((n) => n.type === "phase")!;
  const refs = referencesFor(refWorld, phase.path);
  const owner = phase.path.slice(0, phase.path.indexOf("/phases/"));
  for (const group of refs.in) assert.ok(group.path.startsWith(`${owner}/`), group.path);
});

test("a file that is no entity, and one nothing names, give empty lists", () => {
  assert.deepEqual(referencesFor(world, "example/model/README.md"), { in: [], out: [] });
  const refs = referencesFor(world, "example/model/sources/local.md");
  assert.equal(countOf(refs.out), 0);
  assert.ok(countOf(refs.in) > 0);
});

// A question's Rests on (core 0.40.0): a question is listed under each entity it rests on, and
// under the owner its row names, each saying the column it stands in.
const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";

test("a question is listed under the entity it rests on, and under the owner its row names", () => {
  const experience = world.named.find((n) => n.type === "experience" && n.name === "Splitting the billing domain")!.path;
  const under = referencesFor(world, experience).in.find((g) => g.path === WHO)!;
  assert.deepEqual(under.mentions.map((m) => [m.declared, m.name]), [["## Rests on · Entity", "Splitting the billing domain"]]);
  const owner = referencesFor(world, "example/model/profiles/mira-halvorsen/mira-halvorsen.md").in.find((g) => g.path === WHO)!;
  assert.deepEqual(owner.mentions.map((m) => [m.declared, m.name]), [["## Rests on · Owner", "Mira Halvorsen"]]);
  assert.ok(referencesFor(world, "example/model/features/charge-explanation.md").in.some((g) => g.path.endsWith("how-do-i-find-out-why-a-line-is-on-my-invoice.md")));
});

test("what a question names is what its rows name, and a row naming another owner's name names nothing", () => {
  const out = referencesFor(world, WHO).out.map((g) => g.path);
  assert.ok(out.some((p) => p.endsWith("mira-halvorsen/experiences/2022-beacon-systems.md")));
  assert.ok(out.includes("example/model/profiles/mira-halvorsen/mira-halvorsen.md"));
  // The model does not parse with that row, so the names are the last parse's, as in the vault.
  const files = new Map(world.files).set(WHO, world.files.get(WHO)!.replace("| Mira Halvorsen |", "| Tomas Reyes |"));
  const now = referencesFor({ ...world, files }, WHO).out.map((g) => g.path);
  assert.ok(!now.some((p) => p.includes("/experiences/")), "Tomas has no experience of that name");
  assert.ok(now.includes("example/model/profiles/tomas-reyes/tomas-reyes.md"));
});
