import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType } from "../src/model.ts";
import { example, EXAMPLE, reference, REFERENCE, edited } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";

test("the example passes and parses", () => {
  const m = buildModel(example(), EXAMPLE);
  assert.deepEqual(m.failures, []);
  assert.deepEqual(m.skipped, []);
  assert.ok(m.graph);
  assert.deepEqual(namesByType(m.graph!).get("source"), ["Google Workspace", "Local"]);
});

test("the reference instance passes and parses, in its own layout", () => {
  const m = buildModel(reference(), REFERENCE);
  assert.deepEqual(m.failures, []);
  assert.ok(m.graph);
});
test("an unresolvable reference is reported once: the checks speak, the parser's throw is dropped", () => {
  const m = buildModel(edited(example(), ROLE, (t) => t.replace("source: Local", "source: Nowhere")), EXAMPLE);
  assert.equal(m.graph, null);
  assert.equal(m.failures.length, 1);
  assert.ok(m.failures[0].startsWith(ROLE + ": "));
});

test("a core with a schema missing names the type as skipped", () => {
  const files = example();
  files.delete("core/skill-schema.md");
  assert.ok(buildModel(files, EXAMPLE).skipped.includes("skill"));
});

test("an empty note in a type folder is never offered as a name", () => {
  const files = example();
  files.set("example/model/skills/untitled.md", "");
  const m = buildModel(files, EXAMPLE);
  // The empty note fails the checks and the graph parses all the same, which is what puts an
  // entity named "" in front of completion.
  assert.ok(m.failures.length > 0);
  assert.ok(m.graph);
  assert.deepEqual(namesByType(m.graph!).get("skill"), ["Domain-Driven Design", "Java Programming", "Product Discovery"]);
});

test("the parser's own throw is the failure when the checks found nothing to say", () => {
  // Two processes whose phases carry the same names. Each process lists its own phases, in its
  // own order, so every check passes; R2 scopes a name to its type across the instance, and an
  // owned entity sits in its owner's folder where the checks' duplicate-name reading does not
  // reach, so only the parser sees it. (Two experiences sharing a name served here until core
  // 0.30.0, whose Evidence table made the checks notice that case by another road.)
  const files = example();
  const from = "example/model/processes/delivery/";
  for (const [path, text] of [...files])
    if (path.startsWith(from))
      files.set(
        path.replace(from, "example/model/processes/review/").replace("/delivery.md", "/review.md"),
        path.endsWith("/delivery.md") ? text.replace("# Delivery", "# Review") : text,
      );
  const m = buildModel(files, EXAMPLE);
  assert.equal(m.graph, null);
  assert.deepEqual(m.failures, ['R2: two phase entities share the name "Build"']);
});
