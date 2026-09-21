import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType } from "../src/model.ts";
import { example, EXAMPLE, reference, REFERENCE, edited, whole } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";

test("the example passes and parses", () => {
  const m = buildModel(whole(example()), EXAMPLE);
  assert.deepEqual(m.failures, []);
  assert.deepEqual(m.skipped, []);
  assert.ok(m.graph);
  assert.deepEqual(namesByType(m.graph!).get("source"), ["Google Workspace", "Local"]);
});

test("the reference instance passes and parses, in its own layout", () => {
  const m = buildModel(whole(reference()), REFERENCE);
  assert.deepEqual(m.failures, []);
  assert.ok(m.graph);
});
test("an unresolvable reference is reported once: the checks speak, the parser's throw is dropped", () => {
  const m = buildModel(whole(edited(example(), ROLE, (t) => t.replace("source: Local", "source: Nowhere"))), EXAMPLE);
  assert.equal(m.graph, null);
  assert.equal(m.failures.length, 1);
  assert.ok(m.failures[0].startsWith(ROLE + ": "));
});

test("a core with a schema missing names the type as skipped", () => {
  const files = example();
  files.delete("core/skill-schema.md");
  assert.ok(buildModel(whole(files), EXAMPLE).skipped.includes("skill"));
});

test("an empty note in a type folder is never offered as a name", () => {
  const files = example();
  files.set("example/model/skills/untitled.md", "");
  const m = buildModel(whole(files), EXAMPLE);
  // The empty note fails the checks and the graph parses all the same, which is what puts an
  // entity named "" in front of completion.
  assert.ok(m.failures.length > 0);
  assert.ok(m.graph);
  assert.deepEqual(namesByType(m.graph!).get("skill"), ["Domain-Driven Design", "Java Programming", "Product Discovery"]);
});

test("two processes whose phases share their names are valid, as core 0.31.0 has it", () => {
  // This case served, until core 0.31.0, as the one where the parser threw and the checks found
  // nothing: a phase's name was unique across the instance. Since that release a name of an owned
  // type is unique within its owner, so it parses and passes, and the parser and the checks agree
  // by design; no real input is known any more on which the parser alone speaks. buildModel still
  // shows the parser's own message when the checks found nothing, as a defence and not a case.
  const files = example();
  const from = "example/model/processes/delivery/";
  for (const [path, text] of [...files])
    if (path.startsWith(from))
      files.set(
        path.replace(from, "example/model/processes/review/").replace("/delivery.md", "/review.md"),
        path.endsWith("/delivery.md") ? text.replace("# Delivery", "# Review") : text,
      );
  const m = buildModel(whole(files), EXAMPLE);
  assert.deepEqual(m.failures, []);
  assert.ok(m.graph);
});
test("a required section renamed is reported once, by the heading the schema expects (core 0.31.1)", () => {
  const LEVEL = "example/model/proficiency-levels/expert.md";
  const files = edited(example(), LEVEL, (t) => t.replace("## What it means", "## What it is"));
  const m = buildModel(whole(files), EXAMPLE);
  assert.deepEqual(m.failures, [
    `${LEVEL}: no \`## What it means\`, which proficiency-level-schema.md requires`,
  ]);
  // A section of the page's own breaks nothing, so the graph still parses.
  assert.ok(m.graph);
});

test("a heading only the frontmatter holds is no section, for the checks as for the editor (0.31.2)", () => {
  // Until 0.31.2 the checks read a YAML comment that looked like a required heading as the section,
  // while the parser and this plugin's heading marks did not. Now the pane and the marks agree.
  const LEVEL = "example/model/proficiency-levels/expert.md";
  const files = edited(example(), LEVEL, (t) =>
    t.replace(/\n## What it means\n[\s\S]*$/, "\n").replace(/^---\n/, "---\n## What it means\n"),
  );
  assert.deepEqual(buildModel(whole(files), EXAMPLE).failures, [
    `${LEVEL}: no \`## What it means\`, which proficiency-level-schema.md requires`,
  ]);
});
