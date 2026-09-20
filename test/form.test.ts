import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RULE_PATHS, changesOf, channelFor, columnAfter, excludesOf, formOf, formed, inForm, spanOf } from "../src/form.ts";
import { reference } from "./helpers.ts";

// The rule set this repository vendored, the file a vault that took the form carries.
const RULE_SET = fs.readFileSync(path.join(import.meta.dirname, "..", ".markdownlint-cli2.jsonc"), "utf8");
const config = formOf(RULE_SET);

// Conventions v1.21.0 moved the rule set to the root and retired the copy under conventions/. A
// vault takes a release when its owner says so, so both paths are read and the new one first: a
// plugin that knew only the new path would write nothing into a vault still on v1.20.0 and tell
// its owner the vault has no form. Ordered, because a vault mid-upgrade carries both.
test("the rule set is looked for at the root first and under conventions/ after", () => {
  assert.deepEqual(RULE_PATHS, [".markdownlint-cli2.jsonc", "conventions/markdown.markdownlint-cli2.jsonc"]);
});

// Whichever path it came from, the file parses to the same rules — the retired copy was the same
// options file under another name, so nothing about reading it needs to differ.
test("a rule set read from either path gives the same form", () => {
  assert.deepEqual(formOf(RULE_SET), config);
  assert.notEqual(config, null);
});

// A table the way Obsidian's table editor writes it after one cell was edited: every column as
// wide as its widest cell plus two, the delimiter row as long, alignment colons kept. Read from
// the application's getTableString and makeAlignmentRow.
const ALIGNED = [
  "---",
  "name: Writer",
  "---",
  "",
  "## Skills",
  "",
  "| Skill            | Level      | Since |",
  "| :--------------- | ---------- | ----: |",
  "| Business Writing | Proficient |  2019 |",
  "| Editing          |            |       |",
  "",
].join("\n");

const COMPACT = [
  "---",
  "name: Writer",
  "---",
  "",
  "## Skills",
  "",
  "| Skill | Level | Since |",
  "| :--- | --- | ---: |",
  "| Business Writing | Proficient | 2019 |",
  "| Editing | | |",
  "",
].join("\n");

test("the vendored rule set parses", () => {
  assert.ok(config);
  assert.equal(config["table-delimiter-row"], true);
});

test("a table Obsidian aligned comes back compact, delimiter row and alignment colons included", () => {
  assert.equal(inForm(ALIGNED, config!), COMPACT);
});

test("a note already in the form is left byte for byte", () => {
  assert.equal(inForm(COMPACT, config!), COMPACT);
});

test("every note of the reference instance is already in the form, so leaving one changes nothing", () => {
  const changed = [...reference()].filter(([p, text]) => p.endsWith(".md") && inForm(text, config!) !== text).map(([p]) => p);
  assert.deepEqual(changed, []);
});

test("every note of the reference instance survives a round trip through Obsidian's table editor", () => {
  const align = (text: string) => text.replace(/^(\|.*\|)\n(\|[-: |]+\|)\n((?:\|.*\|\n?)*)/gm, (_all, head: string, delimiter: string, body: string) => {
    const split = (row: string) => row.slice(1, -1).split("|").map((c) => c.trim());
    const rows = [split(head), ...body.split("\n").filter(Boolean).map(split)];
    const marks = split(delimiter);
    const widths = marks.map((_m, i) => Math.max(5, ...rows.map((r) => (r[i] ?? "").length + 2)));
    const row = (r: string[]) => "|" + widths.map((w, i) => " " + (r[i] ?? "").padEnd(w - 1)).join("|") + "|";
    const mark = (m: string, w: number) =>
      m.startsWith(":") && m.endsWith(":") ? " :" + "-".repeat(w - 4) + ": "
        : m.startsWith(":") ? " :" + "-".repeat(w - 3) + " "
        : m.endsWith(":") ? " " + "-".repeat(w - 3) + ": "
        : " " + "-".repeat(w - 2) + " ";
    return [row(rows[0]), "|" + marks.map((m, i) => mark(m, widths[i])).join("|") + "|", ...rows.slice(1).map(row)].join("\n") + "\n";
  });
  let tables = 0;
  for (const [p, text] of reference()) {
    if (!p.endsWith(".md")) continue;
    const aligned = align(text);
    if (aligned === text) continue;
    tables++;
    assert.equal(inForm(aligned, config!), text, p);
  }
  assert.ok(tables > 0, "the fixture carries tables");
});

test("emphasis, strong and list markers take the family's marks", () => {
  assert.equal(inForm("# A\n\n* one _two_ __three__\n", config!), "# A\n\n- one *two* **three**\n");
});

test("a rule set that does not parse, or holds no rules, writes nothing", () => {
  assert.equal(formOf("{ not json"), null);
  assert.equal(formOf("{}"), null);
  assert.ok(formOf("// the family's form\n{ \"config\": { \"MD009\": true } }"));
});

test("the paths written are the paths conventions-format reads", () => {
  const excludes = excludesOf('{ "repo": "robertblust/conventions", "tag": "v1.19.0", "exclude": ["meta", "docs/superpowers/"] }');
  assert.deepEqual(excludes, ["meta", "docs/superpowers"]);
  assert.equal(formed("model/roles/writer.md", excludes), true);
  assert.equal(formed(".claude/agents/writer.md", excludes), true);
  assert.equal(formed("meta/core/role-schema.md", excludes), false);
  assert.equal(formed("docs/superpowers/specs/a.md", excludes), false);
  assert.equal(formed("metadata/a.md", excludes), true);
  assert.equal(formed("node_modules/x/README.md", excludes), false);
  assert.equal(formed("model/roles/writer.json", excludes), false);
  const own = excludesOf('{ "tag": "v1.20.0", "exclude": ["meta", "docs/superpowers"], "format-exclude": ["meta"] }');
  assert.deepEqual(own, ["meta"], "format-exclude replaces exclude where it is named");
  assert.equal(formed("docs/superpowers/specs/a.md", own), true);
  assert.deepEqual(excludesOf('{ "exclude": ["meta"], "format-exclude": [] }'), []);
  assert.deepEqual(excludesOf(null), []);
  assert.deepEqual(excludesOf("{ broken"), []);
});

test("the change handed to an editor is the one span that differs", () => {
  assert.equal(spanOf("same", "same"), null);
  assert.deepEqual(spanOf("| a   | b |\n", "| a | b |\n"), { from: 4, to: 6, text: "" });
  const before = ALIGNED;
  const span = spanOf(before, COMPACT)!;
  assert.equal(before.slice(0, span.from) + span.text + before.slice(span.to), COMPACT);
});

// Review of a trial: Cmd+S wrote the form as one span from the first difference to the last, and
// the cursor on a line in between was carried to the span's edge.
const apply = (text: string, changes: { from: number; to: number; insert: string }[]) =>
  [...changes].sort((x, y) => y.from - x.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text);

test("a change is one span per run of changed lines, and an unchanged line is never in one", () => {
  const before = "# A\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\ntext\n";
  const after = "# A\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\ntext\n";
  const changes = changesOf(before, after);
  assert.equal(apply(before, changes), after);
  // The separator line did not change, so the header and the row are two spans around it.
  assert.equal(changes.length, 2);
  const separator = before.indexOf("| --- |");
  assert.ok(changes.every((c) => c.to <= separator || c.from >= separator + "| --- | --- |".length));
});

test("lines the form adds or removes are one span between the unchanged ones", () => {
  for (const [before, after] of [
    ["a\n\n\n\nb\n", "a\n\nb\n"],
    ["a\nb\n", "a\n\nb\n"],
    ["a\nb", "a\nb\n"],
    ["a\n  b\nc\n", "a\nb\nc\nd\n"],
  ]) assert.equal(apply(before, changesOf(before, after)), after, JSON.stringify([before, after]));
  assert.deepEqual(changesOf("same", "same"), []);
});

// Review found this. MD012 takes trailing blank lines off the end of a file, and lines removed at
// the very end have no line after them to take the newline from: the last one's newline belongs
// to the line before the run. Taking the newline after each instead left one behind, so the text
// written was never the text asked for, the note was read back out of form, written again, and a
// note ending in blank lines never settled.
test("lines removed at the end of a file take the newline before the run, not after it", () => {
  for (const [before, after] of [
    ["a\nb\n\n\n", "a\nb\n"],
    ["a\nb\n\n", "a\nb\n"],
    ["a\nb\n\n\n\n\n", "a\nb\n"],
    ["a\nb\nc\n", "a\n"],
    ["# A\n\n> t\n\n\n", "# A\n\n> t\n"],
  ]) assert.equal(apply(before, changesOf(before, after)), after, JSON.stringify([before, after]));
});

// The form settles: what it writes is already in the form, so the next save changes nothing.
test("a note whose only fault is trailing blank lines is in form after one write", () => {
  const before = "# A\n\n> t\n\n\n";
  const once = apply(before, changesOf(before, inForm(before, config!)));
  assert.equal(once, inForm(once, config!));
  assert.deepEqual(changesOf(once, inForm(once, config!)), []);
});

// What every case above is one of: the changes applied to `before` give `after` exactly. This
// function has now been wrong twice, each time in a shape nobody had written a case for — a
// cursor carried to a table's end, a newline left behind at a file's end — so the property is
// held here over a few thousand pairs rather than over the shapes anyone thought of. The numbers
// come from a seeded generator, so a failure is the same failure on every run.
test("the changes applied to the first text give the second, whatever the two are", () => {
  let seed = 20260920;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)];
  const WORDS = ["", "a", "b", "  c", "| x | y |", "# A", "> t", "```", "- one"];
  for (let run = 0; run < 3000; run++) {
    const a: string[] = [];
    for (let i = 0, n = Math.floor(next() * 8); i < n; i++) a.push(pick(WORDS));
    const b = [...a];
    for (let i = 0, n = Math.floor(next() * 4); i < n; i++) {
      const at = Math.floor(next() * (b.length + 1));
      if (next() < 0.4) b.splice(at, 1);
      else if (next() < 0.5) b.splice(at, 0, pick(WORDS));
      else if (at < b.length) b[at] = pick(WORDS);
    }
    const before = a.join("\n");
    const after = b.join("\n");
    assert.equal(apply(before, changesOf(before, after)), after, JSON.stringify([before, after]));
  }
});

test("a cursor keeps the characters before it that are not spaces, wherever the form moves them", () => {
  assert.equal(columnAfter("| a   | b   |", "| a | b |", 9), 7);
  assert.equal(columnAfter("| a   | b   |", "| a | b |", 0), 0);
  assert.equal(columnAfter("  - x", "- x", 5), 3);
  assert.equal(columnAfter("same", "same", 2), 2);
});

// Review found two faults of one shape: the form was written through the wrong channel. In
// Reading view an editor exists behind the page with nothing of it on screen, and a change
// dispatched into it went where no one was looking. On quit, Obsidian saves nothing after the
// task runs, so a change handed to the editor was lost and the note left last kept its diff at
// every quit. Both are decided here, where a test can hold the rule.
test("the editor writes only while it is on screen and the application is staying up", () => {
  assert.equal(channelFor({ hasEditor: true, showing: true, leaving: false }), "editor");
  // Reading view: an editor, but none of it visible.
  assert.equal(channelFor({ hasEditor: true, showing: false, leaving: false }), "file");
  // No tab holds the note at all.
  assert.equal(channelFor({ hasEditor: false, showing: false, leaving: false }), "file");
  // On the way out, whatever is on screen, because no save follows.
  for (const hasEditor of [true, false])
    for (const showing of [true, false])
      assert.equal(channelFor({ hasEditor, showing, leaving: true }), "leaving", `${hasEditor} ${showing}`);
});
