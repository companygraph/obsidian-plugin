import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { judgedField, setJudged } from "../src/judgedmarks.ts";

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

test("two judgments on the same line become one mark, its title both messages", () => {
  const state = EditorState.create({ doc: "one\n", extensions: [judgedField] });
  const tr = state.update({ effects: [setJudged.of([{ line: 0, message: "a" }, { line: 0, message: "b" }])] });
  const titles: string[] = [];
  tr.state.field(judgedField).between(0, tr.state.doc.length, (_from, _to, deco) => {
    titles.push((deco.spec.attributes as { title: string }).title);
  });
  assert.deepEqual(titles, ["a\nb"]);
});
