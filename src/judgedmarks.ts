// A judged line in the editor: a quiet amber mark with the rule and the judgment as its tooltip,
// apart from a failure's red, and only on a note not changed since it was judged, since the lines
// of one that has may have moved (spec: "Shown").
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";

export const setJudged = StateEffect.define<{ line: number; message: string }[]>();

export const judgedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setJudged)) continue;
      const byLine = new Map<number, string[]>();
      for (const m of effect.value) byLine.set(m.line, [...(byLine.get(m.line) ?? []), m.message]);
      const builder = new RangeSetBuilder<Decoration>();
      for (const [line, messages] of [...byLine].sort((a, b) => a[0] - b[0])) {
        if (line >= tr.state.doc.lines) continue;
        const from = tr.state.doc.line(line + 1).from;
        builder.add(from, from, Decoration.line({ class: "companygraph-judged", attributes: { "aria-label": messages.join("\n") } }));
      }
      marks = builder.finish();
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
