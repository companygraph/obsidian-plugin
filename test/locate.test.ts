import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { locate } from "../src/locate.ts";
import { example, EXAMPLE, edited } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";
const lineOf = (files: Map<string, string>, file: string, text: string) =>
  files.get(file)!.split("\n").findIndex((l) => l.includes(text));

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
  const at = locate('two skill files share the canonical name "Java Programming"', example());
  assert.deepEqual(at, { path: null, line: 0, message: 'two skill files share the canonical name "Java Programming"' });
});

test("a failure about a folder belongs to the instance", () => {
  assert.equal(locate("example/model/stray/ is not a folder of any type (expected one of skills)", example()).path, null);
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
