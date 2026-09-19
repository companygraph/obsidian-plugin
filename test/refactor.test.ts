import test from "node:test";
import assert from "node:assert/strict";
import { checkInstance } from "companygraph-meta-model/checks";
import { buildModel, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { namedOf } from "../src/scope.ts";
import { deletePlan, referencesTo, renamePlan } from "../src/refactor.ts";
import type { RenamePlan } from "../src/refactor.ts";
import { example, EXAMPLE, reference, REFERENCE } from "./helpers.ts";

const setup = (files: Map<string, string>, layout: typeof EXAMPLE) => {
  const named = namedOf(buildModel(files, layout).graph!);
  return { files, named, vocabulary: vocabularyOf(schemasOf(files, layout)), model: layout.model };
};
const entity = (named: ReturnType<typeof namedOf>, type: string, name: string) => named.find((n) => n.type === type && n.name === name)!;

// The files after a plan is carried out, as the vault would hold them.
function carried(files: Map<string, string>, plan: RenamePlan): Map<string, string> {
  assert.ok(!("refused" in plan), "refused" in plan ? plan.refused : "");
  const next = new Map(files);
  for (const [path, text] of plan.texts) next.set(path, text);
  for (const move of plan.moves) {
    if (move.from.endsWith(".md")) {
      next.set(move.to, next.get(move.from)!);
      next.delete(move.from);
    } else
      for (const [path, text] of [...next])
        if (path.startsWith(`${move.from}/`)) {
          next.delete(path);
          next.set(move.to + path.slice(move.from.length), text);
        }
  }
  return next;
}

test("a skill's references are found in frontmatter lists and table cells, and nowhere else", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const java = entity(named, "skill", "Java Programming");
  const found = referencesTo(files, vocabulary, named, model, java);
  assert.deepEqual([...new Set(found.map((m) => m.path))].sort(), [
    "example/model/profiles/mira-halvorsen/experiences/2018-northwind-atelier.md",
    "example/model/profiles/mira-halvorsen/experiences/2022-beacon-systems.md",
    "example/model/profiles/mira-halvorsen/mira-halvorsen.md",
    "example/model/profiles/tomas-reyes/tomas-reyes.md",
    "example/model/roles/backend-engineer.md",
  ]);
  // The skill's own H1 is its name, not a reference to it.
  assert.ok(!found.some((m) => m.path === java.path));
});

test("renaming a skill rewrites its H1, its file and every reference, and the checks pass after", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, vocabulary, named, model, entity(named, "skill", "Java Programming"), "Java");
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.moves, [{ from: "example/model/skills/java-programming.md", to: "example/model/skills/java.md" }]);
  const after = carried(files, plan);
  assert.ok(after.get("example/model/skills/java.md")!.includes("\n# Java\n"));
  assert.ok(!after.get("example/model/roles/backend-engineer.md")!.includes("Java Programming"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("renaming a phase rewrites its process's table and its sibling's gate-to, within that process", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, vocabulary, named, model, entity(named, "phase", "Build"), "Implement");
  const after = carried(files, plan);
  assert.ok(after.has("example/model/processes/delivery/phases/implement.md"));
  assert.ok(after.get("example/model/processes/delivery/delivery.md")!.includes("| Implement |"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("renaming an owner moves its folder and its file, and what it owns goes with it", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, vocabulary, named, model, entity(named, "process", "Delivery"), "Shipping");
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.moves, [
    { from: "example/model/processes/delivery", to: "example/model/processes/shipping" },
    { from: "example/model/processes/shipping/delivery.md", to: "example/model/processes/shipping/shipping.md" },
  ]);
  const after = carried(files, plan);
  assert.ok(after.has("example/model/processes/shipping/phases/build.md"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("an experience keeps its chosen filename, and a name taken in the same scope is refused", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const experience = named.find((n) => n.type === "experience")!;
  const plan = renamePlan(files, vocabulary, named, model, experience, "A New Title");
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(checkInstance(carried(files, plan), EXAMPLE).failures, []);
  const taken = renamePlan(files, vocabulary, named, model, entity(named, "skill", "Java Programming"), "Product Discovery");
  assert.ok("refused" in taken && /named "Product Discovery" already/.test(taken.refused));
  const same = renamePlan(files, vocabulary, named, model, entity(named, "skill", "Java Programming"), "Java Programming");
  assert.ok("refused" in same);
  const empty = renamePlan(files, vocabulary, named, model, entity(named, "skill", "Java Programming"), " -- ");
  assert.ok("refused" in empty);
});

test("renaming any entity of the reference instance leaves the checks as clean as it found them", () => {
  // Every entity, one at a time: a review found the achievement kinds, named by the `###` headings
  // of grouped sections, left behind by a rename that read only fields and cells.
  const { files, named, vocabulary, model } = setup(reference(), REFERENCE);
  assert.deepEqual(checkInstance(files, REFERENCE).failures, []);
  const broken: string[] = [];
  for (const target of named) {
    const plan = renamePlan(files, vocabulary, named, model, target, `${target.name} X`);
    if ("refused" in plan) {
      broken.push(`${target.type} ${target.name}: refused, ${plan.refused}`);
      continue;
    }
    const failures = checkInstance(carried(files, plan), REFERENCE).failures;
    if (failures.length) broken.push(`${target.type} ${target.name}: ${failures[0]}`);
  }
  assert.deepEqual(broken, []);
});

test("an achievement kind's references are the grouped headings that name it", () => {
  const { files, named, vocabulary, model } = setup(reference(), REFERENCE);
  const kind = named.find((n) => n.type === "achievement-kind")!;
  const found = referencesTo(files, vocabulary, named, model, kind);
  assert.ok(found.length > 0);
  for (const m of found) assert.equal(files.get(m.path)!.split("\n")[m.line].slice(0, 4), "### ");
});

test("a name a table or YAML would read as its own is refused", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const java = entity(named, "skill", "Java Programming");
  for (const bad of ["Java | JVM", '"Java"', "Java'", "[Java]", "#Java", "- Java", "> Java", "&Java", "Java: JVM", "Java #1"])
    assert.ok("refused" in renamePlan(files, vocabulary, named, model, java, bad), bad);
  for (const good of ["Java 21", "C#", "Rob's Java", "Java/JVM", "Java (JVM)"])
    assert.ok(!("refused" in renamePlan(files, vocabulary, named, model, java, good)), good);
});

test("the model's one identity or vision cannot be deleted", () => {
  const { files, named, vocabulary, model } = setup(reference(), REFERENCE);
  for (const type of ["identity", "vision"]) {
    const one = named.find((n) => n.type === type)!;
    assert.ok("refused" in deletePlan(files, vocabulary, named, model, one), type);
  }
});

test("deleting a skill lists every reference that would name nothing", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const java = entity(named, "skill", "Java Programming");
  const plan = deletePlan(files, vocabulary, named, model, java);
  assert.ok(!("refused" in plan));
  assert.equal(plan.remove, java.path);
  assert.deepEqual(plan.removed, [java.path]);
  assert.equal(plan.mentions.length, referencesTo(files, vocabulary, named, model, java).length);
  assert.ok(plan.mentions.length > 0);
});

test("deleting an owner removes its folder and what it owns, and lists only references from outside", () => {
  const { files, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = deletePlan(files, vocabulary, named, model, entity(named, "process", "Delivery"));
  assert.ok(!("refused" in plan));
  assert.equal(plan.remove, "example/model/processes/delivery");
  assert.ok(plan.removed.includes("example/model/processes/delivery/phases/build.md"));
  // The phases name each other and the process lists them, but all of that goes with them.
  assert.ok(!plan.mentions.some((m) => m.path.startsWith("example/model/processes/delivery/")));
});
