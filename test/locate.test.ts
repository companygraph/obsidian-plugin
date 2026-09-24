import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { locate } from "../src/locate.ts";
import { example, EXAMPLE, edited, whole } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";
const lineOf = (files: Map<string, string>, file: string, text: string) =>
  files.get(file)!.split("\n").findIndex((l) => l.includes(text));
// Where a line reads exactly this, for the cases where an earlier line has it as a prefix.
const lineIs = (files: Map<string, string>, file: string, text: string) =>
  files.get(file)!.split("\n").findIndex((l) => l === text);

test("a scalar reference that does not resolve lands on its field's line", () => {
  const files = edited(example(), ROLE, (t) => t.replace("source: Local", "source: Nowhere"));
  const [failure] = buildModel(files, EXAMPLE).failures;
  const at = locate(failure, files);
  assert.equal(at.path, ROLE);
  assert.equal(at.line, lineOf(files, ROLE, "source: Nowhere"));
  assert.ok(!at.message.startsWith(ROLE));
});

test("an entry of a block sequence lands on the entry, not on the key above it", () => {
  const files = edited(example(), ROLE, (t) => t.replace("  - Java Programming", "  - Java Programming\n  - Cobol"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("Cobol"))!;
  assert.equal(locate(failure, files).line, lineOf(files, ROLE, "- Cobol"));
});

test("an undeclared field lands on the field", () => {
  const files = edited(example(), ROLE, (t) => t.replace("source: Local", "source: Local\nbogus: 1"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("bogus"))!;
  assert.equal(locate(failure, files).line, lineOf(files, ROLE, "bogus: 1"));
});

test("a failure that names no file belongs to the instance", () => {
  const files = example();
  files.set("example/model/skills/java-programming-again.md", files.get("example/model/skills/java-programming.md")!);
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("share the canonical name"))!;
  assert.deepEqual(locate(failure, files), { path: null, line: 0, message: failure });
});

test("a failure about a folder belongs to the instance", () => {
  const files = example();
  files.set("example/model/stray/note.md", "# Stray\n");
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("is not a folder of any type"))!;
  assert.equal(locate(failure, files).path, null);
});

test("a path with nothing findable in the file falls back to its first line", () => {
  const at = locate(`${ROLE}: no H1, so nothing derives a filename (R2)`, example());
  assert.deepEqual([at.path, at.line], [ROLE, 0]);
});

const MIRA = "example/model/profiles/mira-halvorsen/mira-halvorsen.md";
const EXPERIENCE = "example/model/profiles/mira-halvorsen/experiences/2018-northwind-atelier.md";

test("a body table row that fails lands on the row, not on the section heading it is quoted beside", () => {
  const files = edited(example(), MIRA, (t) =>
    t.replace(
      "| Domain-Driven Design | Competent |",
      "| Domain-Driven Design | Competent |\n| Cobol Wizardry | Competent |",
    ),
  );
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("Cobol Wizardry"))!;
  const at = locate(failure, files);
  assert.equal(at.path, MIRA);
  assert.equal(at.line, lineOf(files, MIRA, "| Cobol Wizardry"));
  assert.notEqual(at.line, lineOf(files, MIRA, "## Skills"));
});

test("the same value read earlier in the file does not fool the section anchor", () => {
  const files = edited(example(), MIRA, (t) => {
    const withMention = t.replace(
      "> Backend engineer who ended up owning the parts nobody else wanted to.",
      "> Backend engineer who ended up owning the parts nobody else wanted to. Once tried Cobol Wizardry.",
    );
    return withMention.replace(
      "| Domain-Driven Design | Competent |",
      "| Domain-Driven Design | Competent |\n| Cobol Wizardry | Competent |",
    );
  });
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("Cobol Wizardry"))!;
  const at = locate(failure, files);
  assert.equal(at.line, lineOf(files, MIRA, "| Cobol Wizardry"));
});

test("a grouped heading that fails lands on the heading, not on the section it groups", () => {
  const files = edited(example(), EXPERIENCE, (t) => t.replace("### Delivery", "### Nonsense"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("Nonsense"))!;
  const at = locate(failure, files);
  assert.equal(at.path, EXPERIENCE);
  assert.equal(at.line, lineOf(files, EXPERIENCE, "### Nonsense"));
});

test("a list entry that reads as the prefix of an earlier entry lands on itself", () => {
  const files = edited(example(), ROLE, (t) => t.replace("  - Java Programming", "  - Java Programming\n  - Java"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes('"Java"'))!;
  const at = locate(failure, files);
  assert.equal(at.path, ROLE);
  assert.equal(at.line, lineIs(files, ROLE, "  - Java"));
});

test("a table cell whose text also reads inside an earlier row lands on its own row", () => {
  const files = edited(example(), MIRA, (t) =>
    t.replace(
      "| Domain-Driven Design | Competent |",
      "| Domain-Driven Design | Competent |\n| Ja | Expert |",
    ),
  );
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes('"Ja"'))!;
  const at = locate(failure, files);
  assert.equal(at.path, MIRA);
  assert.equal(at.line, lineIs(files, MIRA, "| Ja | Expert |"));
});

test("a one-letter entry lands on itself, not on an earlier frontmatter value holding the letter", () => {
  const files = edited(example(), MIRA, (t) => t.replace("  - Backend Engineer", "  - Backend Engineer\n  - G"));
  // The form without a backticked field: the search has no frontmatter field to scope it.
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("resolves to nothing"))!;
  const at = locate(failure, files);
  assert.equal(at.path, MIRA);
  assert.equal(at.line, lineIs(files, MIRA, "  - G"));
});

test("a path with a space in it maps to its file", () => {
  // What Obsidian's own "new note" naming produces: a copy of a real skill beside it.
  const files = example();
  const copy = "example/model/skills/Java Programming 2.md";
  files.set(copy, files.get("example/model/skills/java-programming.md")!);
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.startsWith(copy))!;
  const at = locate(failure, files);
  assert.equal(at.path, copy);
  assert.ok(!at.message.startsWith(copy));
});

// Core 0.30.0 moved a profile's facts into an Evidence table whose last column is a qualifier
// naming one of the profile's own experiences. A qualifier that names nothing is reported by two
// checks, R16 that it resolves nowhere and R5 that it is not the profile's own; both land on the
// row that holds it and neither on the section, which is what the pane and the tint rely on.
test("a qualifier cell that fails lands on its row in the Evidence table, for every check that reports it", () => {
  const files = edited(example(), MIRA, (t) => t.replace("| Splitting the billing domain |", "| A period that never was |"));
  const failures = buildModel(files, EXAMPLE).failures.filter((f) => f.includes("A period that never was"));
  assert.ok(failures.length >= 1);
  for (const failure of failures) {
    const at = locate(failure, files);
    assert.equal(at.path, MIRA);
    assert.equal(at.line, lineOf(files, MIRA, "| A period that never was |"));
  }
});

// A join failure quotes two cells of the row at fault, the skill and the experience, and the
// skill alone reads on every row under that claim. The row that carries both is the row meant.
test("a failure that quotes two cells of one row lands on that row, not on the first to carry one", () => {
  const page = ["---", "source: Local", "---", "", "# Ada", "", "## Evidence", "",
    "| Skill | What it shows | Experience |", "| --- | --- | --- |",
    "| Java | Built the first. | Alpha |", "| Java | Built the second. | Beta |", "| Talks | Spoke. | Beta |", ""].join("\n");
  const files = new Map([["model/profiles/ada/ada.md", page]]);
  const failure = 'model/profiles/ada/ada.md: a row of "## Evidence" under "Java" names `Experience` "Beta", and model/profiles/ada/experiences/beta.md does not list "Java" in `skills`; the schema declares that it does (R16)';
  assert.equal(locate(failure, files).line, 11);
});


// Core 0.40.0: a failure about a question's row quotes the cell it is about, and lands on its row.
test("a failure about a question row lands on that row", () => {
  const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";
  const files = edited(example(), WHO, (t) => t.replace("| Mira Halvorsen |", "| Mira Nobody |"));
  const failures = buildModel(whole(files), EXAMPLE).failures;
  assert.equal(failures.length, 1);
  const at = locate(failures[0], files);
  assert.equal(at.path, WHO);
  assert.equal(files.get(WHO)!.split("\n")[at.line], "| experience | Splitting the billing domain | Mira Nobody | the period |");
});
