import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { excludesOf, formOf, formed, inForm, spanOf } from "../src/form.ts";
import { reference } from "./helpers.ts";

// The rule set this repository vendored, the file a vault that took the form carries.
const RULE_SET = fs.readFileSync(path.join(import.meta.dirname, "..", "conventions", "markdown.markdownlint-cli2.jsonc"), "utf8");
const config = formOf(RULE_SET);

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
