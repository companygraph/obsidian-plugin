import test from "node:test";
import assert from "node:assert/strict";
import { typeOfPath } from "companygraph-meta-model/checks";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { addableSections, headingsOf, insertionAt, placementOf, tableStart, isEntityText, isHeld, lockedLines, lostLine, missingOf, nearMissOf, removalAt, removalRange, sectionAt } from "../src/headings.ts";
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

test("a short heading is a near miss at one edit, and only a longer one at two", () => {
  const phase = vocabulary.get("phase")!;
  // The phase schema declares `## Gate`: four letters, so one edit and no more.
  assert.equal(nearMissOf("Gat", phase, []), "Gate");
  assert.equal(nearMissOf("Note", phase, []), null);
  assert.equal(nearMissOf("Date", phase, []), "Gate");
  assert.equal(nearMissOf("Rates", phase, []), null);
  // Past six letters two edits still count.
  assert.equal(nearMissOf("Refernces", role, []), "References");
});

test("folding keeps letters outside ASCII", () => {
  const umlaut = { fields: [], sections: [{ heading: "Über uns", required: false, columns: null }] };
  // Folded to "überuns" and not to "berun": the umlaut is a letter like any other.
  assert.equal(nearMissOf("über-uns!", umlaut, []), "Über uns");
  assert.equal(nearMissOf("Ü", umlaut, []), null);
});

test("a required section a near miss already points at is not drawn missing a second time", () => {
  const text = "# R\n\n## What it take\n\nA.\n\n## What it produces\n\n## What it never does\n";
  assert.deepEqual(missingOf(lines(text), role), []);
  assert.equal(headingsOf(lines(text), role)[0].nearMiss, "What it takes");
});

test("frontmatter closes on a line that is exactly three dashes, as the parser reads it", () => {
  const text = "---\nsource: Local\n--- \n## What it takes\n---\n# R\n";
  // `--- ` with a trailing space does not close it, so the heading is still inside.
  assert.deepEqual(headingsOf(lines(text), role), []);
});

test("an entity's text has an H1; a table cell's does not", () => {
  assert.equal(isEntityText("---\nsource: Local\n---\n\n# Reviewer\n"), true);
  assert.equal(isEntityText("Java Programming"), false);
});

test("a heading inserted before another leaves a blank line for text between them", () => {
  const text = "# R\n\n## What it takes\n\nA.\n\n## What it never does\n";
  const at = text.indexOf("## What it never");
  const { insert, cursor } = insertionAt(text, at, "What it produces");
  assert.equal(insert, "## What it produces\n\n\n\n");
  const after = text.slice(0, at) + insert + text.slice(at);
  assert.equal(after.slice(at + cursor - 1, at + cursor + 1), "\n\n");
  assert.ok(after.includes("A.\n\n## What it produces\n\n\n\n## What it never does"));
});

test("a heading inserted at the end stands after a blank line, with or without a final newline", () => {
  for (const text of ["# R\n\n- Merges.\n", "# R\n\n- Merges."]) {
    const { insert, cursor } = insertionAt(text, text.length, "What it takes");
    const after = text + insert;
    assert.ok(after.endsWith("- Merges.\n\n## What it takes\n"), JSON.stringify(after));
    assert.equal(text.length + cursor, after.length);
  }
});

test("a heading inserted where the line above is blank adds no second blank line", () => {
  const text = "# R\n\n";
  const { insert } = insertionAt(text, text.length, "What it takes");
  assert.equal(text + insert, "# R\n\n## What it takes\n");
});

test("removing a middle section takes it to the next heading", () => {
  const r = removalRange(PAGE, 19, role);
  assert.ok(!("refused" in r));
  const after = PAGE.slice(0, r.from) + r.insert + PAGE.slice(r.to);
  assert.ok(after.includes("Mine.\n\n## What it never does"));
  assert.ok(!after.includes("References"));
});

test("removing the last section leaves the page ending in one newline", () => {
  const text = "# R\n\n## What it takes\n\nA.\n\n## References\n\n| What | Link |\n";
  const r = removalRange(text, 8, role);
  assert.ok(!("refused" in r));
  assert.equal(text.slice(0, r.from) + r.insert + text.slice(r.to), "# R\n\n## What it takes\n\nA.\n");
});

test("removal is refused where Remove section refuses", () => {
  assert.deepEqual(removalRange(PAGE, 11, role), { refused: "required", heading: "What it takes" });
});

// The lock (spec §8): the H1 and every declared heading keep their text. What is compared is the
// locked lines before an edit and after it, so an edit anywhere else passes whatever it does.
test("the locked lines are every declared heading, not the page's own and not the H1", () => {
  assert.deepEqual(lockedLines(lines(PAGE), role), ["## What it takes", "## References", "## What it never does"]);
});

test("an edit that keeps every locked line passes, and one that loses one names it", () => {
  const held = (text: string) => lockedLines(lines(text), role);
  assert.equal(lostLine(held(PAGE), held(PAGE.replace("A branch.", "A branch and a plan."))), null);
  assert.equal(lostLine(held(PAGE), held(PAGE.replace("## What it takes", "## What it is"))), "## What it takes");
  // The H1 is the entity's name, and renaming it is an edit like any other; the checks then name
  // every reference that no longer resolves.
  assert.equal(lostLine(held(PAGE), held(PAGE.replace("# Reviewer", "# Critic"))), null);
});

test("a new line before or after a heading, and a declared heading added, keep the lock", () => {
  const before = lockedLines(lines(PAGE), role);
  for (const after of [
    PAGE.replace("## What it takes", "\n## What it takes"),
    PAGE.replace("## What it takes", "## What it takes\n"),
    PAGE + "\n\n## What it produces\n",
    PAGE.replace("## Notes", "## Notes, mine"),
  ])
    assert.equal(lostLine(before, lockedLines(lines(after), role)), null);
});

test("a declared heading written twice is held once, so the copy can be deleted", () => {
  const twice = PAGE + "\n\n## References\n";
  assert.equal(lostLine(lockedLines(lines(twice), role), lockedLines(lines(PAGE), role)), null);
  // Both copies gone is the heading lost.
  const none = PAGE.replace("## References", "");
  assert.equal(lostLine(lockedLines(lines(twice), role), lockedLines(lines(none), role)), "## References");
});

test("trailing spaces are no part of a held line, so they can be trimmed", () => {
  const spaced = PAGE.replace("## What it takes", "## What it takes  ");
  const held = (text: string) => lockedLines(lines(text), role);
  assert.equal(lostLine(held(spaced), held(PAGE)), null);
});

test("a `---` typed at the top of a page is not frontmatter until it closes", () => {
  const text = "---\n# Reviewer\n\n## What it takes\n";
  assert.deepEqual(lockedLines(lines(text), role), ["## What it takes"]);
  assert.equal(lostLine(lockedLines(lines(text.slice(4)), role), lockedLines(lines(text), role)), null);
});

test("the lock holds every edit but a reload, undo, redo, this plugin's own and a composing input method", () => {
  for (const held of [undefined, "input", "input.type", "input.paste", "input.drop", "delete.backward", "delete.cut", "move.line", "select"])
    assert.equal(isHeld(held), true, String(held));
  for (const passed of ["set", "undo", "redo", "input.section", "delete.section", "input.form", "input.type.compose"])
    assert.equal(isHeld(passed), false, passed);
  // A name that merely begins like one that passes is still held.
  assert.equal(isHeld("settle"), true);
});


// Add a section (spec §8): what it offers and where it writes.
test("Add a section offers the declared sections the page lacks, in the schema's order", () => {
  assert.deepEqual(addableSections(lines(PAGE), role).map((s) => [s.heading, s.required]), [["What it produces", true]]);
  const bare = "# Reviewer\n\n> Reads the work.\n";
  assert.deepEqual(
    addableSections(lines(bare), role).map((s) => s.heading),
    ["What it takes", "What it produces", "What it never does", "References"],
  );
});

test("an optional section is placed by the schema's order as a required one is", () => {
  const text = "# R\n\n## What it takes\n\nA.\n\n## What it never does\n\n- B.\n\n## Notes\n\nMine.\n";
  // References comes last in the schema: after What it never does, so before the next heading.
  assert.equal(placementOf(lines(text), role, "References"), 10);
  assert.equal(placementOf(lines(text), role, "What it produces"), 6);
});

test("a table section starts with its header and a separator of plain dashes", () => {
  const references = role.sections.find((s) => s.heading === "References")!;
  const header = tableStart(references);
  assert.equal(header.length, 2);
  assert.match(header[1], /^\| --- (\| --- )*\|$/);
  assert.deepEqual(tableStart(role.sections.find((s) => s.heading === "What it takes")!), []);
});

test("a table section written before a heading leaves the cursor on the row after the header", () => {
  const text = "# R\n\n## What it never does\n";
  const at = text.indexOf("## What");
  const { insert, cursor } = insertionAt(text, at, "References", ["| What | Link |", "| --- | --- |"]);
  assert.equal(insert, "## References\n\n| What | Link |\n| --- | --- |\n\n\n");
  const after = text.slice(0, at) + insert + text.slice(at);
  const line = after.slice(0, at + cursor).split("\n").length - 1;
  assert.equal(after.split("\n")[line - 1], "| --- | --- |");
});

test("a table section written at the end ends with its header, the cursor after it", () => {
  const text = "# R\n\n- B.\n";
  const { insert, cursor } = insertionAt(text, text.length, "References", ["| What | Link |", "| --- | --- |"]);
  assert.equal(text + insert, "# R\n\n- B.\n\n## References\n\n| What | Link |\n| --- | --- |\n");
  assert.equal(cursor, insert.length);
});
