import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { linksOf, merge, mergePath, rename } from "../src/links.ts";
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

test("an entry Obsidian rebuilt since is not taken from", () => {
  const resolved: Record<string, Record<string, number>> = { "a.md": { "b.md": 1 } };
  const added = merge(resolved, { "a.md": { "b.md": 1 } }, new Map());
  resolved["a.md"] = { "b.md": 1 }; // Obsidian re-read a.md and made a new entry
  merge(resolved, {}, added);
  assert.deepEqual(resolved["a.md"], { "b.md": 1 });
});

// Review found that merging made an entry for a note Obsidian had none for, so a stale path, one
// renamed or deleted a moment before, came back as a ghost key. The map is Obsidian's: the plugin
// adds to entries that exist and makes none.
test("a note Obsidian has no entry for is left without one", () => {
  const resolved: Record<string, Record<string, number>> = { "a.md": {} };
  const added = merge(resolved, { "a.md": { "b.md": 1 }, "gone.md": { "b.md": 1 } }, new Map());
  assert.deepEqual(resolved, { "a.md": { "b.md": 1 } });
  assert.deepEqual([...added.keys()], ["a.md"]);
});

// Obsidian re-reads one note and rebuilds its entry, then says so for that note. The note's own
// edges go back into the fresh entry there and then, so the redraw Obsidian asks for after it
// already carries them and the plugin need not ask for another.
test("one note's edges go back into its rebuilt entry, and no other note's are touched", () => {
  const resolved: Record<string, Record<string, number>> = { "a.md": { "x.md": 1 }, "c.md": { "x.md": 5 } };
  const links = { "a.md": { "b.md": 1 }, "c.md": { "b.md": 1 } };
  const added = merge(resolved, links, new Map());
  resolved["a.md"] = { "x.md": 1 }; // rebuilt by Obsidian
  mergePath(resolved, links, added, "a.md");
  assert.deepEqual(resolved, { "a.md": { "x.md": 1, "b.md": 1 }, "c.md": { "x.md": 5, "b.md": 1 } });
  merge(resolved, {}, added);
  assert.deepEqual(resolved, { "a.md": { "x.md": 1 }, "c.md": { "x.md": 5 } });
});

// Review found that a rename moves the same entry to the new path, and what the plugin added was
// remembered under the old one, so it was never taken back, even after the plugin was disabled.
test("a rename moves what was added, and the model's links, to the new path", () => {
  const resolved: Record<string, Record<string, number>> = { "a.md": { "x.md": 1 } };
  const links: Record<string, Record<string, number>> = { "a.md": { "b.md": 1 }, "c.md": { "a.md": 1 } };
  const added = merge(resolved, links, new Map());
  resolved["n.md"] = resolved["a.md"]; delete resolved["a.md"]; // Obsidian's onRename
  rename(links, added, "a.md", "n.md");
  merge(resolved, {}, added);
  assert.deepEqual(resolved, { "n.md": { "x.md": 1 } });
  assert.deepEqual(links, { "n.md": { "b.md": 1 }, "c.md": { "n.md": 1 } });
});

// Core 0.40.0: a question's row draws its edge, `Rests on.Entity`, so the graph view links the
// question to what it rests on; the Owner cell draws none, as a qualifier draws none.
test("a question links to each entity it rests on, and not to the owner its row names", () => {
  const links = linksOf(graph);
  const who = links["example/model/questions/who-split-billing-out-of-the-monolith.md"];
  assert.deepEqual(Object.keys(who).filter((p) => !p.includes("/sources/")), ["example/model/profiles/mira-halvorsen/experiences/2022-beacon-systems.md"]);
  assert.equal(links["example/model/questions/does-beacon-systems-publish-its-revenue.md"]?.["example/model/sources/local.md"], 1, "a question resting on nothing names its source alone");
});
