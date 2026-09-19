import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { linksOf, merge } from "../src/links.ts";
import { example, EXAMPLE } from "./helpers.ts";

const graph = buildModel(example(), EXAMPLE).graph!;
const MIRA = "example/model/profiles/mira-halvorsen/mira-halvorsen.md";

// What the model adds to the graph view: one link per edge the parser draws, from the file of
// the entity that names to the file of the entity named. A qualifier draws no edge in the model
// and none here.
test("the model's edges become links between files, counted", () => {
  const links = linksOf(graph);
  assert.equal(links[MIRA]["example/model/skills/java-programming.md"], 3, "once in Skills and twice in Evidence");
  assert.equal(links[MIRA]["example/model/roles/backend-engineer.md"], 1);
  assert.ok(!Object.keys(links[MIRA]).some((p) => p.includes("/experiences/")), "a qualifier draws no link");
});

// Obsidian's map is never replaced. What was added is taken away before adding again, and an
// entry Obsidian has since rebuilt for a note is left as Obsidian made it.
test("merging adds to Obsidian's entries and takes back only what it added", () => {
  const mine = { "a.md": { "b.md": 1 } };
  const resolved: Record<string, Record<string, number>> = { "a.md": { "b.md": 2, "c.md": 1 } };
  const added = merge(resolved, mine, new Map());
  assert.deepEqual(resolved, { "a.md": { "b.md": 3, "c.md": 1 } });
  const again = merge(resolved, { "a.md": { "d.md": 1 } }, added);
  assert.deepEqual(resolved, { "a.md": { "b.md": 2, "c.md": 1, "d.md": 1 } });
  merge(resolved, {}, again);
  assert.deepEqual(resolved, { "a.md": { "b.md": 2, "c.md": 1 } });
});

test("an entry Obsidian rebuilt since is not taken from, and a note Obsidian has no entry for gets one", () => {
  const resolved: Record<string, Record<string, number>> = { "a.md": { "b.md": 1 } };
  const added = merge(resolved, { "a.md": { "b.md": 1 }, "e.md": { "b.md": 1 } }, new Map());
  resolved["a.md"] = { "b.md": 1 }; // Obsidian re-read a.md and made a new entry
  merge(resolved, {}, added);
  assert.deepEqual(resolved["a.md"], { "b.md": 1 });
  assert.deepEqual(resolved["e.md"], {});
});
