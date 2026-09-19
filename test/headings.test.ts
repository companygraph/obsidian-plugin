import test from "node:test";
import assert from "node:assert/strict";
import { typeOfPath } from "companygraph-meta-model/checks";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { headingsOf, missingOf, nearMissOf, removalAt, sectionAt } from "../src/headings.ts";
import { example, EXAMPLE, reference, REFERENCE } from "./helpers.ts";

const vocabulary = vocabularyOf(schemasOf(example(), EXAMPLE));
// A role declares three required sections and one optional, `## References`.
const role = vocabulary.get("role")!;
const lines = (text: string) => text.split("\n");

const PAGE = [
  "---",
  "## not a heading, frontmatter",
  "source: Local",
  "---",
  "",
  "# Reviewer",
  "",
  "> Reads the work.",
  "",
  "## What it takes",
  "",
  "A branch.",
  "",
  "## Notes",
  "",
  "Mine.",
  "",
  "## References",
  "",
  "| What | Link |",
  "",
  "## What it never does",
  "",
  "- Merges.",
].join("\n");

test("a heading is required, optional or the page's own, as the schema declares it", () => {
  assert.deepEqual(
    headingsOf(lines(PAGE), role).map((h) => [h.line, h.heading, h.kind]),
    [
      [9, "What it takes", "required"],
      [13, "Notes", "own"],
      [17, "References", "optional"],
      [21, "What it never does", "required"],
    ],
  );
});

test("a heading is declared only as written: case and trailing words make it the page's own", () => {
  const kinds = headingsOf(lines("# R\n\n## What It Takes\n\n## What it takes, roughly\n"), role).map((h) => h.kind);
  assert.deepEqual(kinds, ["own", "own"]);
});

test("a missing required section is placed after the declared section before it in the schema's order", () => {
  // The schema orders What it takes, What it produces, What it never does, References.
  // What it produces is missing: it belongs after What it takes, so before the next heading.
  assert.deepEqual(missingOf(lines(PAGE), role), [{ heading: "What it produces", before: 13 }]);
});

test("with no declared section before it, a missing one goes before the first heading", () => {
  const text = "# Reviewer\n\n> Reads the work.\n\n## What it produces\n\nA review.\n\n## What it never does\n\n- Merges.\n";
  assert.deepEqual(missingOf(lines(text), role), [{ heading: "What it takes", before: 4 }]);
});

test("with no heading at all, every required section goes at the end, in the schema's order", () => {
  const text = "# Reviewer\n\n> Reads the work.\n";
  assert.deepEqual(missingOf(lines(text), role), [
    { heading: "What it takes", before: 4 },
    { heading: "What it produces", before: 4 },
    { heading: "What it never does", before: 4 },
  ]);
});

test("an optional section is never missing", () => {
  assert.ok(!missingOf(lines(PAGE), role).some((m) => m.heading === "References"));
});

test("a near miss names the declared heading the page does not carry", () => {
  const carried = ["What it takes", "What it never does"];
  assert.equal(nearMissOf("Referencs", role, carried), "References");
  assert.equal(nearMissOf("what it produces", role, carried), "What it produces");
  assert.equal(nearMissOf("What-it-produces!", role, carried), "What it produces");
  // Already carried: a second one is the page's own, not a typo of the first.
  assert.equal(nearMissOf("What it take", role, carried), null);
  assert.equal(nearMissOf("Notes", role, carried), null);
});

test("an own heading carries its near miss", () => {
  const text = "# R\n\n## What it takes\n\n## Referencs\n";
  const own = headingsOf(lines(text), role).find((h) => h.kind === "own")!;
  assert.equal(own.nearMiss, "References");
});

test("a section runs from its heading to the next heading, blank lines included", () => {
  assert.deepEqual(sectionAt(lines(PAGE), 18), { heading: "References", from: 17, to: 21 });
  // The last section runs to the end of the file.
  assert.deepEqual(sectionAt(lines(PAGE), 23), { heading: "What it never does", from: 21, to: 24 });
  // Above the first heading there is no section.
  assert.equal(sectionAt(lines(PAGE), 6), null);
});

test("every heading of the reference instance is declared, and no required section is missing", () => {
  const files = reference();
  const refVocabulary = vocabularyOf(schemasOf(files, REFERENCE));
  let checked = 0;
  for (const [path, text] of files) {
    if (!path.startsWith(`${REFERENCE.model}/`) || !path.endsWith(".md")) continue;
    const type = typeOfPath(path, REFERENCE.model);
    const v = type ? refVocabulary.get(type) : undefined;
    if (!v) continue;
    checked++;
    assert.deepEqual(headingsOf(lines(text), v).filter((h) => h.kind === "own"), [], path);
    assert.deepEqual(missingOf(lines(text), v), [], path);
  }
  assert.ok(checked > 0);
});

test("Remove section removes a declared optional section whole, and refuses the rest", () => {
  assert.deepEqual(removalAt(lines(PAGE), 19, role), { heading: "References", from: 17, to: 21 });
  assert.deepEqual(removalAt(lines(PAGE), 11, role), { refused: "required", heading: "What it takes" });
  assert.deepEqual(removalAt(lines(PAGE), 14, role), { refused: "own", heading: "Notes" });
  assert.deepEqual(removalAt(lines(PAGE), 5, role), { refused: "none" });
});
