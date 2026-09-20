import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { namedOf } from "../src/scope.ts";
import { refusedHere, refusedName } from "../src/names.ts";
import { example, EXAMPLE } from "./helpers.ts";

const named = namedOf(buildModel(example(), EXAMPLE).graph!);
const MODEL = EXAMPLE.model;

test("a name with nothing to slug names no file", () => {
  assert.match(refusedName("")!, /letter or digit/);
  assert.match(refusedName("   ")!, /letter or digit/);
  assert.match(refusedName("---")!, /letter or digit/);
  assert.equal(refusedName("Java Programming"), null);
});

test("a name may hold nothing a cell or a YAML value reads as its own", () => {
  // A pipe splits a table cell, so a reference to this entity could never be read back.
  assert.match(refusedName("Java | Kotlin")!, /pipe/);
  // YAML: a quote at either end, an opening sign, `: ` or ` #` inside.
  for (const bad of ['"Java"', "'Java'", "#Java", "- Java", "> Java", "&Java", "*Java", "!Java", "%Java", "@Java", "[Java", "{Java", "`Java", "Java: the language", "Java # one"])
    assert.notEqual(refusedName(bad), null, bad);
  assert.equal(refusedName("Java"), null);
  // ` #` is refused although a table cell could carry it: the same name is written as a bare
  // frontmatter value too, and there it would start a YAML comment. The guard holds a name to
  // every place it has to survive, not to the most forgiving one.
  assert.notEqual(refusedName("C # Programming"), null);
  assert.equal(refusedName("C#"), null, "a # with no space before it starts no comment");
});

test("a newline in a name is refused, since a name is one line of a file", () => {
  assert.notEqual(refusedName("Java\nKotlin"), null);
});

test("R2: a name taken by another entity of the type is refused, and the entity itself is not", () => {
  const java = named.find((n) => n.type === "skill" && n.name === "Java Programming")!;
  const at = `${MODEL}/skills/anything.md`;
  assert.match(refusedHere(named, MODEL, "skill", at, "Java Programming")!, /already/);
  // Renaming asks with itself excepted, so its own name is not its own collision.
  assert.equal(refusedHere(named, MODEL, "skill", java.path, "Java Programming", java.path), null);
  // A name held by another type is no collision: R2 scopes a name to its type.
  assert.equal(refusedHere(named, MODEL, "role", at, "Java Programming"), null);
  assert.equal(refusedHere(named, MODEL, "skill", at, "A skill nothing is called"), null);
});

test("an owned name is read within the owner the file would sit in", () => {
  const owned = named.find((n) => n.type === "experience")!;
  const owner = owned.path.slice(0, owned.path.indexOf("/experiences/"));
  // In its own owner the name is taken; under another owner the same name is free.
  assert.match(refusedHere(named, MODEL, "experience", `${owner}/experiences/2099-x.md`, owned.name)!, /already/);
  const other = named.find((n) => n.type === "profile" && !owned.path.startsWith(n.path.slice(0, n.path.lastIndexOf("/"))));
  if (other) {
    const elsewhere = `${other.path.slice(0, other.path.lastIndexOf("/"))}/experiences/2099-x.md`;
    assert.equal(refusedHere(named, MODEL, "experience", elsewhere, owned.name), null);
  }
});
