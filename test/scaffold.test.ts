import test from "node:test";
import assert from "node:assert/strict";
import { checkInstance } from "companygraph-meta-model/checks";
import { UUIDV7 } from "companygraph-meta-model/ids";
import { schemasOf, typesOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { scaffoldOf, targetsFor } from "../src/scaffold.ts";
import { example, EXAMPLE, reference, REFERENCE, whole, PACKED } from "./helpers.ts";

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
  const seat = vocabulary.get("seat")!;
  const { text, tagline } = scaffoldOf(seat, "Critic", { source: "Local" });
  const lines = text.split("\n");
  assert.equal(lines[tagline], "> ");
  assert.ok(text.includes("source: Local\n"));
  assert.ok(text.includes("# Critic\n"));
  const headings = lines.filter((l) => l.startsWith("## "));
  assert.deepEqual(headings, seat.sections.filter((s) => s.required).map((s) => `## ${s.heading}`));
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
  // A seat requires three sections; its scaffold carries them, under the name R12 derives.
  const seat = vocabulary.get("seat")!;
  const files = example();
  const path = byType(targetsFor(EXAMPLE.model, null, (p) => files.has(p))).get("seat")!.pathFor("Critic")!;
  assert.equal(path, "example/model/seats/critic.md");
  files.set(path, scaffoldOf(seat, "Critic", { source: "Local" }).text);
  // One thing is left to its author, as a required list field with no item yet is: a required
  // section declared `Bulleted.` carries at least one item, and what a seat refuses is nothing
  // a scaffold can write.
  const owed = checkInstance(files, EXAMPLE).failures.filter((f) => f.startsWith(path));
  assert.deepEqual(owed.filter((f) => !/has no item/.test(f)), []);
  assert.deepEqual(owed.map((f) => f.match(/"## ([^"]+)" has no item/)?.[1]), ["What it never does"]);
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
  // yet, as a field or as a section, an owner's folder with nothing owned in it, an owner's
  // table that does not list it, and, since core 0.41.0, each required value it leaves blank,
  // which R9 reads as absent. Those are named: exactly the required scalars the scaffold was
  // not handed a value for, and no other.
  const files = reference();
  const refVocabulary = vocabularyOf(schemasOf(files, REFERENCE));
  // Core 0.55.0: a required table section owes a row as a required list owes an item, and the
  // scaffold does not write one; the row, like the item, is the author's.
  const expected = [
    /carries no items/,
    /has no item, and its schema requires the section/,
    /has no row, and its schema requires the section/,
    /is missing (phases|tracks|experiences)\//,
    /does not list/,
    // Core 0.56.0: a question-kind gathers at least two questions, and a new one gathers none;
    // the questions, like the item, are the author's.
    /question pages name it in `kind`; a question-kind gathers at least 2/,
  ];
  assert.ok(files.has(`${REFERENCE.model}/identifier.md`), "the reference instance declares its ids");
  const seen = new Set<string>();
  for (const active of ["model/processes/delivery/delivery.md", "model/profiles/robert-blust/robert-blust.md"]) {
    for (const target of targetsFor(REFERENCE.model, active, (p) => files.has(p))) {
      if (seen.has(target.type) || !refVocabulary.has(target.type)) continue;
      seen.add(target.type);
      const trial = new Map(files);
      const path = target.pathFor("Zeta Probe Thing", "2031-04")!;
      // Handed the instance's own identifier file, as New entity hands it: since core 0.49.0 it
      // declares uuidv7, so the scaffold writes the id and leaves it to no author.
      const scaffold = scaffoldOf(refVocabulary.get(target.type)!, "Zeta Probe Thing", target.asks ? { [target.asks]: "2031-04" } : {}, files.get(`${REFERENCE.model}/identifier.md`) ?? null);
      assert.equal(scaffold.owes, null, `${target.type}: the id owed`);
      trial.set(path, scaffold.text);
      const asked = target.asks ? [target.asks, "id"] : ["id"];
      const failures = checkInstance(whole(trial), REFERENCE).failures;
      const blank = failures.map((f) => f.startsWith(`${path}: `) ? f.match(/^[^:]+: `([^`]+)` is blank, which [a-z-]+-schema\.md requires(?: — one of .+)?$/)?.[1] : undefined).filter((f) => f !== undefined);
      const left = refVocabulary.get(target.type)!.fields.filter((f) => f.required && !f.list && !asked.includes(f.name)).map((f) => f.name);
      assert.deepEqual([...blank].sort(), [...left].sort(), `${target.type}: the blank required values`);
      const unexpected = failures.filter((f) => !expected.some((e) => e.test(f)) && !(f.startsWith(`${path}: `) && / is blank, which /.test(f)));
      assert.deepEqual(unexpected, [], target.type);
    }
  }
  assert.ok(seen.has("phase") && seen.has("track") && seen.has("experience") && seen.has("process"));
});

// Core 0.40.0: `question` is a type of the package's own list and has a schema, so New entity
// offers it from anywhere, as a concept is, and its scaffold is what the schema requires.
test("a question is offered from anywhere, named by the slug of its question, and its scaffold passes the checks", () => {
  const question = byType(targetsFor(MODEL, null, none)).get("question")!;
  assert.equal(question.where, "model/questions/");
  assert.equal(question.pathFor("Who split billing out of the monolith?"), "model/questions/who-split-billing-out-of-the-monolith.md");
  assert.ok(byType(targetsFor(MODEL, "model/profiles/robert-blust/robert-blust.md", none)).has("question"));
  // Core 0.45.0: kind is required on a question, so the scaffold needs it filled the way source is.
  const { text } = scaffoldOf(vocabulary.get("question")!, "Who wrote the pricing rules?", { source: "Local", kind: "Product" });
  assert.ok(!text.includes("## Rests on"), "an optional section is the author's to add");
  const files = example();
  const path = "example/model/questions/who-wrote-the-pricing-rules.md";
  files.set(path, text.replace("> \n", "> The pricing rules say who owns them.\n"));
  assert.deepEqual(checkInstance(files, EXAMPLE).failures.filter((f) => f.startsWith(path)), []);
});

// R18 (core 0.49.0): every page carries an id, first in its frontmatter, in the format
// `model/identifier.md` declares. A new page takes a fresh UUID version 7 where the file declares
// that format, and where an instance has no identifier file yet and its core declares `id`; a
// pattern is the instance's own, which the tooling cannot make, so the id is left for its author.
const IDENTIFIER = "example/model/identifier.md";
const withFormat = (text: string, format: string) => text.replace(/^format: .*$/m, format);

test("a new page's first line is a fresh UUID v7 where the identifier file declares one", () => {
  const identifier = example().get(IDENTIFIER)!;
  const a = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, identifier);
  const b = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, identifier);
  const first = (text: string) => text.split("\n")[1];
  assert.match(first(a.text), /^id: /);
  assert.match(first(a.text).slice("id: ".length), UUIDV7);
  assert.notEqual(first(a.text), first(b.text), "each page its own id");
  assert.equal(a.text.match(/^id:/gm)!.length, 1, "the id is written once");
  assert.equal(a.owes, null);
});

test("an instance with no identifier file yet takes a UUID v7 where its core declares an id", () => {
  const { text, owes } = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, null);
  assert.match(text.split("\n")[1].slice("id: ".length), UUIDV7);
  assert.equal(owes, null);
});

test("a core that declares no id gets none written", () => {
  const skill = vocabulary.get("skill")!;
  const older = { ...skill, fields: skill.fields.filter((f) => f.name !== "id") };
  const { text } = scaffoldOf(older, "Pricing", { source: "Local" }, null);
  assert.doesNotMatch(text, /^id:/m);
});

test("under a declared pattern the id is left blank, and what is owed says so", () => {
  const identifier = withFormat(example().get(IDENTIFIER)!, "format: pattern\npattern: ^SK-[0-9]{4}$");
  const { text, owes } = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, identifier);
  assert.equal(text.split("\n")[1], "id:");
  assert.match(owes!, /pattern/);
  assert.match(owes!, /model\/identifier\.md/);
  // An identifier file that does not read makes no id either, and says why.
  const broken = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, withFormat(identifier, "format: guid"));
  assert.equal(broken.text.split("\n")[1], "id:");
  assert.match(broken.owes!, /"guid"/);
});

// New entity reads the identifier file from the vault, and a read can fail: the page is still
// made, its id blank and the reason owed, as for a file that does not read.
test("an identifier file that could not be read leaves the id blank and says why", () => {
  const { text, owes } = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, { unread: "EACCES: permission denied" });
  assert.equal(text.split("\n")[1], "id:");
  assert.equal(owes, "Its id is left blank: model/identifier.md does not read (EACCES: permission denied).");
  assert.match(text, /^# Pricing$/m, "the page is made all the same");
});

test("a scaffolded page passes R18, and under a pattern once its author writes the id", () => {
  const files = example();
  const path = "example/model/skills/pricing.md";
  files.set(path, scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, files.get(IDENTIFIER)!).text);
  const r18 = (m: Map<string, string>) => checkInstance(whole(m), EXAMPLE).failures.filter((f) => f.startsWith(path) && /`id`|R18/.test(f));
  assert.deepEqual(r18(files), []);
  // The positive control: the same page without its id fails R18.
  files.set(path, files.get(path)!.replace(/^id: .*\n/m, ""));
  assert.equal(r18(files).length, 1);
  // Under a pattern the page is written with its id blank, and passes once its author fills it.
  // Only this page's findings are read, so the other pages keep their UUIDs.
  files.set(IDENTIFIER, withFormat(files.get(IDENTIFIER)!, "format: pattern\npattern: ^[A-Z]{2}-[0-9]{4}$"));
  const patterned = scaffoldOf(vocabulary.get("skill")!, "Pricing", { source: "Local" }, files.get(IDENTIFIER)!);
  files.set(path, patterned.text);
  assert.equal(r18(files).length, 1, "a blank id fails until it is written");
  files.set(path, patterned.text.replace(/^id:$/m, "id: SK-0001"));
  assert.deepEqual(r18(files), []);
});

test("New entity offers a pack's types where they sit: a context anywhere, its owned types only inside one", () => {
  const types = typesOf(PACKED);
  const outside = targetsFor("model", "model/skills/x.md", () => false, types).map((t) => t.type);
  assert.ok(outside.includes("bounded-context"));
  assert.ok(!outside.includes("aggregate"));
  const inside = targetsFor("model", "model/bounded-contexts/resolution/resolution.md", () => false, types);
  assert.ok(inside.some((t) => t.type === "aggregate" && t.where === "model/bounded-contexts/resolution/aggregates/"));
  const context = targetsFor("model", null, () => false, types).find((t) => t.type === "bounded-context")!;
  assert.match(context.owes ?? "", /first concept-design/);
  // A vault that takes no pack is offered none of them.
  assert.ok(!targetsFor("model", null, () => false).some((t) => t.type === "bounded-context"));
});
