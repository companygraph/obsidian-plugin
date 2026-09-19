import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { absentFields, candidatesFor, cursorAfter, entersThrough } from "../src/candidates.ts";
import { example, EXAMPLE } from "./helpers.ts";

const files = example();
const vocabulary = vocabularyOf(schemasOf(files, EXAMPLE));
const names = namesByType(buildModel(files, EXAMPLE).graph!);
const profile = vocabulary.get("profile")!;
const labels = (c: { label: string }[]) => c.map((x) => x.label);

test("a reference value offers the names of its type, those starting with what is typed first", () => {
  const c = candidatesFor({ kind: "value", field: "source", typed: "lo", start: 8, item: false, glued: false }, profile, names, []);
  assert.deepEqual(c, [{ label: "Local", insert: "Local" }]);
});

test("a name of another type is never offered", () => {
  const c = candidatesFor({ kind: "value", field: "roles", typed: "e", start: 4, item: true, glued: false }, profile, names, []);
  assert.deepEqual(labels(c), ["Backend Engineer", "Reviewer"]);
});

test("an enum value offers what the schema permits", () => {
  const c = candidatesFor({ kind: "value", field: "nature", typed: "", start: 8, item: false, glued: false }, profile, names, []);
  assert.deepEqual(labels(c), ["human", "agent"]);
});

test("a key offers what the file lacks, required first, and a list opens its first entry", () => {
  const lines = ["---", "source: Local", "", "---"];
  // `o` is in source, location and roles; source is in the file, so it is not offered.
  const o = candidatesFor({ kind: "key", typed: "o", start: 0 }, profile, names, lines);
  assert.ok(!labels(o).some((l) => l.startsWith("source ")));
  assert.equal(o.find((x) => x.label === "roles")!.insert, "roles:\n  - ");
  // `a` is in nature and in optional fields; the required one leads.
  const a = candidatesFor({ kind: "key", typed: "a", start: 0 }, profile, names, lines);
  assert.equal(a[0].label, "nature (required)");
});

test("a cell offers by the column's declaration", () => {
  const c = candidatesFor({ kind: "cell", section: "Skills", column: "Level", typed: "pro", start: 0 }, profile, names, []);
  assert.deepEqual(labels(c), ["Proficient"]);
  assert.deepEqual(candidatesFor({ kind: "cell", section: "Skills", column: "Evidence", typed: "", start: 0 }, profile, names, []), []);
});

test("a heading offers the sections the file lacks", () => {
  const c = candidatesFor({ kind: "heading", typed: "", start: 3 }, profile, names, ["## Skills", "## "]);
  assert.ok(!labels(c).some((l) => l.startsWith("Skills")));
  assert.ok(c.length > 0);
});

test("with no parsed graph there are no names, and enum values still come", () => {
  const none = new Map<string, string[]>();
  assert.deepEqual(candidatesFor({ kind: "value", field: "source", typed: "", start: 0, item: false, glued: false }, profile, none, []), []);
  assert.equal(candidatesFor({ kind: "value", field: "nature", typed: "", start: 0, item: false, glued: false }, profile, none, []).length, 2);
});

test("a heading already present with two spaces after the ## is not offered again", () => {
  const c = candidatesFor({ kind: "heading", typed: "", start: 3 }, profile, names, ["##  Summary", "## "]);
  assert.ok(!labels(c).some((l) => l.startsWith("Summary")));
});

test("a list field offers its names on an entry of the list and not on the key's own line", () => {
  const key = { kind: "value", field: "roles", typed: "", start: 7, item: false, glued: false } as const;
  assert.deepEqual(candidatesFor(key, profile, names, []), []);
  assert.deepEqual(labels(candidatesFor({ ...key, typed: "e", item: true }, profile, names, [])), ["Backend Engineer", "Reviewer"]);
});

const role = vocabulary.get("role")!;
const prefixed = new Map([["skill", ["Java", "JavaScript"]]]);

test("a name typed in full leaves nothing to complete, though a longer name still matches it", () => {
  const c = candidatesFor({ kind: "value", field: "requires", typed: "Java", start: 4, item: true, glued: false }, role, prefixed, []);
  assert.deepEqual(c, []);
});

test("a name typed in part still offers every name it could become", () => {
  const c = candidatesFor({ kind: "value", field: "requires", typed: "Jav", start: 4, item: true, glued: false }, role, prefixed, []);
  assert.deepEqual(labels(c), ["Java", "JavaScript"]);
});

test("a heading typed in full leaves nothing to complete", () => {
  assert.deepEqual(candidatesFor({ kind: "heading", typed: "Skills", start: 3 }, profile, names, ["## Skills"]), []);
});

test("a heading typed in part is still offered, though the line it is on already reads as a section", () => {
  const c = candidatesFor({ kind: "heading", typed: "Sum", start: 3 }, profile, names, ["## Sum"]);
  assert.deepEqual(labels(c), ["Summary"]);
});

test("the cursor after an insert sits at its end, on the last line it wrote", () => {
  assert.deepEqual(cursorAfter({ line: 3, ch: 8 }, "Local"), { line: 3, ch: 13 });
  assert.deepEqual(cursorAfter({ line: 3, ch: 0 }, "roles:\n  - "), { line: 4, ch: 4 });
  assert.deepEqual(cursorAfter({ line: 0, ch: 2 }, ""), { line: 0, ch: 2 });
});

// Found in the first run inside Obsidian: with the cursor directly after the colon, accepting
// wrote `source:Local`, which YAML reads as one bare word and no field at all.
test("a value written directly after the colon brings its own space", () => {
  const c = candidatesFor({ kind: "value", field: "source", typed: "lo", start: 7, item: false, glued: true }, profile, names, []);
  assert.deepEqual(c, [{ label: "Local", insert: " Local" }]);
});

test("a glued value typed in full still leaves nothing to complete", () => {
  const c = candidatesFor({ kind: "value", field: "source", typed: "Local", start: 7, item: false, glued: true }, profile, names, []);
  assert.deepEqual(c, []);
});

// Also from that run: on an empty entry of a list the popup opened, and the Enter meant to end
// the list inserted the first name instead. Where Enter belongs to the editor, nothing is
// offered until something is typed; after `key: ` and after `## ` the position itself asks.
// The second thing the owner said about an empty entry: with nothing shown until a letter is
// typed, he could not see what the list may hold. So an empty entry and an empty cell offer
// everything they could hold, like any other position, and whether Enter belongs to the editor
// there is a separate question with its own answer below.
test("an empty list entry and an empty cell offer everything they could hold", () => {
  const entry = { kind: "value", field: "roles", typed: "", start: 4, item: true, glued: false } as const;
  assert.deepEqual(labels(candidatesFor(entry, profile, names, [])), ["Backend Engineer", "Reviewer"]);
  const cell = { kind: "cell", section: "Skills", column: "Level", typed: " ", start: 0 } as const;
  assert.equal(candidatesFor(cell, profile, names, []).length, 4);
});

// The first thing he said: on an empty entry, Enter ends the list, and a popup that takes it
// writes a name nobody chose. Where nothing is typed on an entry or in a cell, Enter is the
// editor's, popup or not; everywhere else it accepts.
test("Enter belongs to the editor on an empty list entry and in an empty cell, and nowhere else", () => {
  assert.equal(entersThrough({ kind: "value", field: "roles", typed: "", start: 4, item: true, glued: false }), true);
  assert.equal(entersThrough({ kind: "cell", section: "Skills", column: "Level", typed: "  ", start: 0 }), true);
  assert.equal(entersThrough({ kind: "value", field: "roles", typed: "Re", start: 4, item: true, glued: false }), false);
  assert.equal(entersThrough({ kind: "value", field: "source", typed: "", start: 8, item: false, glued: false }), false);
  assert.equal(entersThrough({ kind: "key", typed: "", start: 0 }), false);
  assert.equal(entersThrough({ kind: "heading", typed: "", start: 3 }), false);
});

// Once the list is a table's, Tab matters as much as Enter: it moves to the next cell, and a
// popup that accepted on it would fill every empty cell one tabs through. So the rule is one for
// both keys: while nothing is typed they are the editor's, until an arrow key has moved in the
// list, which is choosing, and from then on they accept.
test("moving in the list with an arrow key is choosing, and then the key accepts even with nothing typed", () => {
  const entry = { kind: "value", field: "roles", typed: "", start: 4, item: true, glued: false } as const;
  const cell = { kind: "cell", section: "Skills", column: "Level", typed: "", start: 0 } as const;
  assert.equal(entersThrough(entry, false), true);
  assert.equal(entersThrough(entry, true), false);
  assert.equal(entersThrough(cell, false), true);
  assert.equal(entersThrough(cell, true), false);
});

// The owner, in the trial: "without typing s for source-id, I may not know the keys". An empty
// key line is how the fields a file may still take are found at all, so it offers by itself.
test("an empty key line offers every field the file lacks, required first", () => {
  const lines = ["---", "source: Local", "", "---"];
  const c = candidatesFor({ kind: "key", typed: "", start: 0 }, profile, names, lines);
  assert.equal(c[0].label, "nature (required)");
  assert.ok(!labels(c).some((l) => l.startsWith("source ")));
  assert.ok(labels(c).includes("roles"));
});

// One decision, two callers: the key popup in Source mode and the Add a field picker, which is
// how a field is added from the Properties widget, where Obsidian's own list knows no schema.
test("the fields a file may still take are those its schema declares and it lacks, required first", () => {
  const lines = ["---", "source: Local", "roles:", "  - Reviewer", "---", "", "# Mira", "nature: not a field down here"];
  const absent = absentFields(profile, lines);
  assert.equal(absent[0].name, "nature");
  assert.ok(absent[0].required);
  assert.ok(!absent.some((f) => f.name === "source" || f.name === "roles"));
  assert.ok(absent.some((f) => f.name === "source-id"));
  assert.deepEqual(absentFields(profile, ["# No frontmatter"]).map((f) => f.name), profile.fields.filter((f) => f.required).concat(profile.fields.filter((f) => !f.required)).map((f) => f.name));
});
