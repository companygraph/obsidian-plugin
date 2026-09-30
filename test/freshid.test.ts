import test from "node:test";
import assert from "node:assert/strict";
import { freshIdChange, freshIdOffered, withFreshId } from "../src/freshid.ts";

// Give this page a fresh id (spec §8): offered where the plugin may make an id, as the scaffold
// makes one, and written as the one change to the page's `id:` line.
const OLD = "0199a0c4-7b3e-7c11-9a2f-3c5e8d1f2a40";
const NEW = "0199a0c4-8000-7c11-9a2f-3c5e8d1f2a41";
const PAGE = ["---", `id: ${OLD}`, "source: Local", "---", "", "# Reviewer", ""].join("\n");
const apply = (text: string, c: { from: number; to: number; insert: string }) => text.slice(0, c.from) + c.insert + text.slice(c.to);
const UUIDV7_FILE = "---\nformat: uuidv7\n---\n\n# Identifier\n";
const PATTERN_FILE = "---\nformat: pattern\npattern: ^R-[0-9]+$\n---\n\n# Identifier\n";

test("offered where the type declares an id and the instance makes UUID version 7 ids, or has no identifier file", () => {
  assert.equal(freshIdOffered(true, null), true);
  assert.equal(freshIdOffered(true, UUIDV7_FILE), true);
});

test("not offered under a declared pattern, an identifier file that does not read or is not read yet, or a type without an id", () => {
  assert.equal(freshIdOffered(true, PATTERN_FILE), false);
  assert.equal(freshIdOffered(true, "---\nformat: guid\n---\n"), false);
  assert.equal(freshIdOffered(true, { unread: "EACCES" }), false);
  assert.equal(freshIdOffered(true, undefined), false);
  assert.equal(freshIdOffered(false, null), false);
  assert.equal(freshIdOffered(false, UUIDV7_FILE), false);
});

test("the id line's value is replaced and nothing else in the file changes", () => {
  assert.equal(apply(PAGE, freshIdChange(PAGE, NEW)), PAGE.replace(OLD, NEW));
  // A quoted id, a comment and a blank id all become the new id alone.
  for (const was of [`"${OLD}"`, `${OLD} # set by New entity`, "", "~"]) {
    const text = PAGE.replace(`id: ${OLD}`, was ? `id: ${was}` : "id:");
    assert.equal(apply(text, freshIdChange(text, NEW)), PAGE.replace(OLD, NEW), was);
  }
});

test("a page without an id gains one as its first frontmatter line, and a page without frontmatter gains that too", () => {
  const none = PAGE.replace(`id: ${OLD}\n`, "");
  assert.equal(apply(none, freshIdChange(none, NEW)), PAGE.replace(OLD, NEW));
  const bare = "# Reviewer\n";
  assert.equal(apply(bare, freshIdChange(bare, NEW)), `---\nid: ${NEW}\n---\n\n# Reviewer\n`);
  // An `id:` in the body is not the page's.
  const body = `${none}id: elsewhere\n`;
  assert.equal(apply(body, freshIdChange(body, NEW)), `${PAGE.replace(OLD, NEW)}id: elsewhere\n`);
});

test("the text with a fresh id is the text with that one change made", () => {
  assert.equal(withFreshId(PAGE, NEW), PAGE.replace(OLD, NEW));
  assert.equal(withFreshId("# Reviewer\n", NEW), `---\nid: ${NEW}\n---\n\n# Reviewer\n`);
});

test("a page with carriage returns keeps them, and gains no second frontmatter", () => {
  const crlf = PAGE.replaceAll("\n", "\r\n");
  assert.equal(withFreshId(crlf, NEW), crlf.replace(OLD, NEW));
  const none = crlf.replace(`id: ${OLD}\r\n`, "");
  const gained = withFreshId(none, NEW);
  assert.equal(gained, crlf.replace(OLD, NEW));
  assert.equal(gained.split("\r\n").filter((l) => l === "---").length, 2);
  assert.ok(!/(^|[^\r])\n/.test(gained), "every line ends as the page's do");
  // A page with no frontmatter gains one that ends as its first line does.
  assert.equal(withFreshId("# Reviewer\r\n", NEW), `---\r\nid: ${NEW}\r\n---\r\n\r\n# Reviewer\r\n`);
  // A line ending that differs from the first is not rewritten.
  const mixed = crlf.replace("# Reviewer\r\n", "# Reviewer\n");
  assert.equal(withFreshId(mixed, NEW), mixed.replace(OLD, NEW));
});
