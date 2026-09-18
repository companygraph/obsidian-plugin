// The open file's failures, marked on their lines. A CodeMirror state field fed by one effect;
// the message is the line's tooltip.
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";

export interface Mark { line: number; message: string }

export const setMarks = StateEffect.define<Mark[]>();

export const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setMarks)) continue;
      const byLine = new Map<number, string[]>();
      for (const mark of effect.value) byLine.set(mark.line, [...(byLine.get(mark.line) ?? []), mark.message]);
      const builder = new RangeSetBuilder<Decoration>();
      for (const [line, messages] of [...byLine].sort((a, b) => a[0] - b[0])) {
        if (line >= tr.state.doc.lines) continue;
        const from = tr.state.doc.line(line + 1).from;
        builder.add(from, from, Decoration.line({ class: "companygraph-mark", attributes: { title: messages.join("\n") } }));
      }
      marks = builder.finish();
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
