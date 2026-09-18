import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { locate } from "../src/locate.ts";
import { example, EXAMPLE, edited } from "./helpers.ts";

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
      "| Domain-Driven Design | Competent | Split the billing domain into two bounded contexts; the seams have held under two years of change. |",
      "| Domain-Driven Design | Competent | Split the billing domain into two bounded contexts; the seams have held under two years of change. |\n| Cobol Wizardry | Competent | Wrote some COBOL once. |",
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
      "| Domain-Driven Design | Competent | Split the billing domain into two bounded contexts; the seams have held under two years of change. |",
      "| Domain-Driven Design | Competent | Split the billing domain into two bounded contexts; the seams have held under two years of change. |\n| Cobol Wizardry | Competent | Wrote some COBOL once. |",
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
      "| Domain-Driven Design | Competent | Split the billing domain into two bounded contexts; the seams have held under two years of change. |",
      "| Domain-Driven Design | Competent | Split the billing domain into two bounded contexts; the seams have held under two years of change. |\n| Ja | Expert | Tried it once. |",
    ),
  );
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes('"Ja"'))!;
  const at = locate(failure, files);
  assert.equal(at.path, MIRA);
  assert.equal(at.line, lineIs(files, MIRA, "| Ja | Expert | Tried it once. |"));
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
