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
