import test from "node:test";
import assert from "node:assert/strict";
import { checkInstance } from "companygraph-meta-model/checks";
import { buildModel, schemasOf } from "../src/model.ts";
import type { Files } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { namedOf } from "../src/scope.ts";
import { deletePlan, referencesTo, renamePlan } from "../src/refactor.ts";
import type { RenamePlan } from "../src/refactor.ts";
import { edited, example, EXAMPLE, reference, REFERENCE, whole } from "./helpers.ts";

const setup = (files: Map<string, string>, layout: typeof EXAMPLE) => {
  const named = namedOf(buildModel(whole(files), layout).graph!);
  return {
    files,
    paths: new Set(whole(files).keys()),
    named,
    vocabulary: vocabularyOf(schemasOf(files, layout)),
    model: layout.model,
  };
};
const entity = (named: ReturnType<typeof namedOf>, type: string, name: string) => named.find((n) => n.type === type && n.name === name)!;

// The files after a plan is carried out, as the vault would hold them: every key under a moved
// folder moves with it, bytes included, as the vault's own folder rename does. `files` is
// `whole`, since a plan's moves and texts never mention a picture and there would be nothing to
// carry it otherwise.
function carried(files: Files, plan: RenamePlan): Files {
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
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "skill", "Java Programming"), "Java");
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.moves, [{ from: "example/model/skills/java-programming.md", to: "example/model/skills/java.md" }]);
  const after = carried(whole(files), plan);
  assert.ok((after.get("example/model/skills/java.md") as string).includes("\n# Java\n"));
  assert.ok(!(after.get("example/model/roles/backend-engineer.md") as string).includes("Java Programming"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("renaming a phase rewrites its process's table and its sibling's gate-to, within that process", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "phase", "Build"), "Implement");
  const after = carried(whole(files), plan);
  assert.ok(after.has("example/model/processes/delivery/phases/implement.md"));
  assert.ok((after.get("example/model/processes/delivery/delivery.md") as string).includes("| Implement |"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("renaming an owner moves its folder and its file, and what it owns goes with it", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "process", "Delivery"), "Shipping");
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.moves, [
    { from: "example/model/processes/delivery", to: "example/model/processes/shipping" },
    { from: "example/model/processes/shipping/delivery.md", to: "example/model/processes/shipping/shipping.md" },
  ]);
  const after = carried(whole(files), plan);
  assert.ok(after.has("example/model/processes/shipping/phases/build.md"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("renaming a pictured owner moves its picture with the folder, and the checks stay clean", () => {
  // The edit this wave came from: `carried` used to put a fixture's pictures back at their
  // ORIGINAL paths after a plan moved the folder, so a rename of AI Agent could never be tried.
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "profile", "AI Agent"), "Helper");
  assert.ok(!("refused" in plan));
  const after = carried(whole(files), plan);
  assert.ok(after.has("example/model/profiles/helper/ai-agent.png"), [...after.keys()].join("\n"));
  assert.ok(!after.has("example/model/profiles/ai-agent/ai-agent.png"));
  assert.deepEqual(checkInstance(after, EXAMPLE).failures, []);
});

test("an experience keeps its chosen filename, and a name taken in the same scope is refused", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const experience = named.find((n) => n.type === "experience")!;
  const plan = renamePlan(files, paths, vocabulary, named, model, experience, "A New Title");
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(checkInstance(carried(whole(files), plan), EXAMPLE).failures, []);
  const taken = renamePlan(files, paths, vocabulary, named, model, entity(named, "skill", "Java Programming"), "Product Discovery");
  assert.ok("refused" in taken && /named "Product Discovery" already/.test(taken.refused));
  const same = renamePlan(files, paths, vocabulary, named, model, entity(named, "skill", "Java Programming"), "Java Programming");
  assert.ok("refused" in same);
  const empty = renamePlan(files, paths, vocabulary, named, model, entity(named, "skill", "Java Programming"), " -- ");
  assert.ok("refused" in empty);
});

test("renaming any entity of the reference instance leaves the checks as clean as it found them", () => {
  // Every entity, one at a time: a review found the achievement kinds, named by the `###` headings
  // of grouped sections, left behind by a rename that read only fields and cells.
  const { files, paths, named, vocabulary, model } = setup(reference(), REFERENCE);
  assert.deepEqual(checkInstance(whole(files), REFERENCE).failures, []);
  const broken: string[] = [];
  for (const target of named) {
    const plan = renamePlan(files, paths, vocabulary, named, model, target, `${target.name} X`);
    if ("refused" in plan) {
      broken.push(`${target.type} ${target.name}: refused, ${plan.refused}`);
      continue;
    }
    const failures = checkInstance(carried(whole(files), plan), REFERENCE).failures;
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
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const java = entity(named, "skill", "Java Programming");
  for (const bad of ["Java | JVM", '"Java"', "Java'", "[Java]", "#Java", "- Java", "> Java", "&Java", "Java: JVM", "Java #1"])
    assert.ok("refused" in renamePlan(files, paths, vocabulary, named, model, java, bad), bad);
  for (const good of ["Java 21", "C#", "Rob's Java", "Java/JVM", "Java (JVM)"])
    assert.ok(!("refused" in renamePlan(files, paths, vocabulary, named, model, java, good)), good);
});

test("a rename is refused when the target folder exists already as a picture alone", () => {
  // The other half of the same fix: a folder that holds no note, only a picture, has no key in
  // `files` (R9's text map) and would be invisible to a check that read `files.keys()` alone.
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const ghost = new Set(paths);
  ghost.add("example/model/processes/ghost/cover.png");
  const plan = renamePlan(files, ghost, vocabulary, named, model, entity(named, "process", "Delivery"), "Ghost");
  assert.ok("refused" in plan && /ghost\/ exists already/.test(plan.refused), JSON.stringify(plan));
});

test("the model's one identity or vision cannot be deleted", () => {
  const { files, paths, named, vocabulary, model } = setup(reference(), REFERENCE);
  for (const type of ["identity", "vision"]) {
    const one = named.find((n) => n.type === type)!;
    assert.ok("refused" in deletePlan(files, paths, vocabulary, named, model, one), type);
  }
});

test("deleting a skill lists every reference that would name nothing", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const java = entity(named, "skill", "Java Programming");
  const plan = deletePlan(files, paths, vocabulary, named, model, java);
  assert.ok(!("refused" in plan));
  assert.equal(plan.remove, java.path);
  assert.deepEqual(plan.removed, [java.path]);
  assert.equal(plan.mentions.length, referencesTo(files, vocabulary, named, model, java).length);
  assert.ok(plan.mentions.length > 0);
});

test("deleting an owner removes its folder and what it owns, and lists only references from outside", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = deletePlan(files, paths, vocabulary, named, model, entity(named, "process", "Delivery"));
  assert.ok(!("refused" in plan));
  assert.equal(plan.remove, "example/model/processes/delivery");
  assert.ok(plan.removed.includes("example/model/processes/delivery/phases/build.md"));
  // The phases name each other and the process lists them, but all of that goes with them.
  assert.ok(!plan.mentions.some((m) => m.path.startsWith("example/model/processes/delivery/")));
});

test("deleting a pictured owner lists its picture among what is removed", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = deletePlan(files, paths, vocabulary, named, model, entity(named, "profile", "AI Agent"));
  assert.ok(!("refused" in plan));
  assert.deepEqual(plan.removed, [
    "example/model/profiles/ai-agent/ai-agent.md",
    "example/model/profiles/ai-agent/ai-agent.png",
    "example/model/profiles/ai-agent/experiences/README.md",
  ]);
});

// The edit this release came from: a track renamed in a process's table left three phases headed
// with the old name and nothing said so. A track is an entity since core 0.33.0, so the heading
// is a reference like any other and a rename carries it.
test("renaming a track rewrites its process's table and every phase heading that names it", () => {
  const { files, paths, named, vocabulary, model } = setup(reference(), REFERENCE);
  const code = entity(named, "track", "Code");
  const headed = referencesTo(files, vocabulary, named, model, code).filter((m) => m.path.includes("/phases/"));
  assert.deepEqual([...new Set(headed.map((m) => m.path.split("/").pop()))].sort(), ["implement.md", "plan.md", "spec.md"]);
  for (const m of headed) assert.equal(files.get(m.path)!.split("\n")[m.line], "### Code");

  const after = carried(whole(files), renamePlan(files, paths, vocabulary, named, model, code, "Software"));
  assert.ok(after.has("model/processes/delivery/tracks/software.md"));
  assert.ok((after.get("model/processes/delivery/delivery.md") as string).includes("| Software |"));
  for (const phase of ["implement", "plan", "spec"]) {
    const text = after.get(`model/processes/delivery/phases/${phase}.md`) as string;
    assert.ok(text.includes("\n### Software\n") && !text.includes("\n### Code\n"), phase);
  }
  assert.deepEqual(checkInstance(after, REFERENCE).failures, []);
});

test("a track renamed in the table alone is a failure naming the row, which is what went unsaid", () => {
  const files = reference();
  const path = "model/processes/delivery/delivery.md";
  files.set(path, files.get(path)!.replace("| Code |", "| Code2 |"));
  const failures = checkInstance(whole(files), REFERENCE).failures;
  assert.ok(failures.some((f) => f.startsWith(`${path}: `) && f.includes('"Code2"') && f.includes("ref → track")), failures.join("\n"));
  assert.ok(failures.some((f) => f.includes('does not list "Code"')), failures.join("\n"));
});

// A question's Rests on (core 0.40.0): the Entity cell names what its row's Type and Owner say,
// and the Owner cell names the owner, so a rename of either reaches the row, and a delete of
// either leaves the row naming nothing.
const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";
const HOW = "example/model/questions/how-do-i-find-out-why-a-line-is-on-my-invoice.md";

test("renaming an experience a question rests on rewrites the row's Entity cell, and the checks pass after", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "experience", "Splitting the billing domain"), "Splitting billing");
  assert.ok(!("refused" in plan));
  assert.match(plan.texts.get(WHO)!, /^\| experience \| Splitting billing \| Mira Halvorsen \| the period \|$/m);
  assert.deepEqual(checkInstance(carried(whole(files), plan), EXAMPLE).failures, []);
});

test("renaming an owner rewrites every Owner cell that names it, and the rows still resolve", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "profile", "Mira Halvorsen"), "Mira Hale");
  assert.ok(!("refused" in plan));
  assert.match(plan.texts.get(WHO)!, /^\| experience \| Splitting the billing domain \| Mira Hale \| the period \|$/m);
  assert.deepEqual(checkInstance(carried(whole(files), plan), EXAMPLE).failures, []);
});

test("renaming a feature a question rests on rewrites its cell, and leaves a row of another feature alone", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "feature", "Pricing rules"), "Price rules");
  assert.ok(!("refused" in plan));
  const text = plan.texts.get(HOW)!;
  assert.match(text, /^\| feature \| Price rules \| \| what it costs \|$/m);
  assert.match(text, /^\| feature \| Charge explanation \| \| where a line comes from \|$/m);
});

test("a row naming the same name under another owner is not the renamed entity's", () => {
  // Tomas has no experience of this name; a row saying he has is a broken row, not a mention.
  const files = edited(example(), WHO, (t) => t.replace("| Mira Halvorsen |", "| Tomas Reyes |"));
  const { named, vocabulary, model } = setup(example(), EXAMPLE);
  const found = referencesTo(files, vocabulary, named, model, entity(named, "experience", "Splitting the billing domain"));
  assert.ok(!found.some((m) => m.path === WHO));
});

test("renaming any entity of the example, questions among them, leaves the checks clean", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  assert.ok(named.some((n) => n.type === "question"));
  const broken: string[] = [];
  for (const target of named) {
    const plan = renamePlan(files, paths, vocabulary, named, model, target, `${target.name} X`);
    if ("refused" in plan) {
      broken.push(`${target.type} ${target.name}: refused, ${plan.refused}`);
      continue;
    }
    const failures = checkInstance(carried(whole(files), plan), EXAMPLE).failures;
    if (failures.length) broken.push(`${target.type} ${target.name}: ${failures[0]}`);
  }
  assert.deepEqual(broken, []);
});

test("deleting what a question rests on lists the question's row among what would name nothing", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const experience = deletePlan(files, paths, vocabulary, named, model, entity(named, "experience", "Splitting the billing domain"));
  assert.ok(!("refused" in experience));
  const row = files.get(WHO)!.split("\n").findIndex((l) => l.startsWith("| experience |"));
  assert.ok(experience.mentions.some((m) => m.path === WHO && m.line === row));
  // An owner goes with what it owns: its row's Entity cell and its Owner cell both name nothing.
  const owner = deletePlan(files, paths, vocabulary, named, model, entity(named, "profile", "Mira Halvorsen"));
  assert.ok(!("refused" in owner));
  assert.equal(owner.mentions.filter((m) => m.path === WHO && m.line === row).length, 2);
});
