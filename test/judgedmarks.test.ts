import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { judgedField, setJudged } from "../src/judgedmarks.ts";
import { marksField, setMarks } from "../src/marks.ts";

// The field never sees Obsidian's own document, whose lines can move under a judgment placed
// before a rename or an edit lands; a line past what the document now has must be dropped rather
// than thrown on, the same guard marks.ts already applies to a failure's own marks.
test("a judgment on a line past the document's end is dropped, not thrown", () => {
  const state = EditorState.create({ doc: "one\ntwo\n", extensions: [judgedField] });
  const tr = state.update({ effects: [setJudged.of([{ line: 0, message: "kept" }, { line: 9, message: "past the end" }])] });
  const lines: number[] = [];
  tr.state.field(judgedField).between(0, tr.state.doc.length, (from) => { lines.push(tr.state.doc.lineAt(from).number - 1); });
  assert.deepEqual(lines, [0]);
});

test("two judgments on the same line become one mark, its tooltip both messages", () => {
  const state = EditorState.create({ doc: "one\n", extensions: [judgedField] });
  const tr = state.update({ effects: [setJudged.of([{ line: 0, message: "a" }, { line: 0, message: "b" }])] });
  const tooltips: string[] = [];
  tr.state.field(judgedField).between(0, tr.state.doc.length, (_from, _to, deco) => {
    tooltips.push((deco.spec.attributes as Record<string, string>)["aria-label"]);
  });
  assert.deepEqual(tooltips, ["a\nb"]);
});

// A line can carry a failure and a judgment at once. CodeMirror merges the attributes of two line
// decorations by overwriting, so the two marks name different attributes: the failure keeps the
// browser's title, the judgment Obsidian's aria-label, and both tooltips survive.
test("a failure's tooltip and a judgment's tooltip stand on one line together", () => {
  const state = EditorState.create({ doc: "one\n", extensions: [judgedField, marksField] });
  const tr = state.update({ effects: [setJudged.of([{ line: 0, message: "judged" }]), setMarks.of([{ line: 0, message: "failed" }])] });
  const seen: Record<string, string> = {};
  for (const field of [judgedField, marksField])
    tr.state.field(field).between(0, tr.state.doc.length, (_f, _t, value) => {
      const attributes = (value.spec as { attributes?: Record<string, string> }).attributes ?? {};
      Object.assign(seen, attributes);
    });
  assert.equal(seen.title, "failed");
  assert.equal(seen["aria-label"], "judged");
});
