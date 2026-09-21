// The picture an entity carries, drawn where its name stands: a widget at the start of the H1's
// line, from a state field as the heading marks are, rebuilt when the text changes, when a
// rebuild sends `refreshNames` — which is when a picture added to the vault is first seen — and
// when the editor turns out to hold another file. What is drawn is decided in picture.ts.
import { editorInfoField } from "obsidian";
import { RangeSetBuilder, StateField } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { pictureOf } from "./picture.ts";
import { refreshNames } from "./namelinks.ts";

class PictureWidget extends WidgetType {
  readonly src: string;
  readonly name: string;
  constructor(src: string, name: string) { super(); this.src = src; this.name = name; }
  eq(other: PictureWidget) { return other.src === this.src && other.name === this.name; }
  toDOM() {
    const img = document.createElement("img");
    img.className = "companygraph-picture";
    img.src = this.src;
    img.alt = this.name;
    img.width = 48; img.height = 48;
    return img;
  }
  ignoreEvent() { return true; }
}

interface Drawn { path: string | null; marks: DecorationSet }

const fileIn = (state: EditorState) => state.field(editorInfoField, false)?.file?.path ?? null;
const NONE = (path: string | null): Drawn => ({ path, marks: Decoration.none });

function draw(plugin: CompanyGraphPlugin, state: EditorState): Drawn {
  const path = fileIn(state);
  const layout = plugin.layout;
  if (!path || !layout) return NONE(path);
  const type = typeOfPath(path, layout.model);
  const vocabulary = type ? plugin.vocabulary.get(type) : undefined;
  if (!vocabulary) return NONE(path);
  const picture = pictureOf(state.doc.toString(), path, vocabulary);
  const file = picture ? plugin.app.vault.getFileByPath(picture.file) : null;
  if (!picture || !file) return NONE(path);
  const at = state.doc.line(picture.line + 1).from;
  const builder = new RangeSetBuilder<Decoration>();
  builder.add(at, at, Decoration.widget({ widget: new PictureWidget(plugin.app.vault.getResourcePath(file), picture.name), side: -1 }));
  return { path, marks: builder.finish() };
}

export function pictureMark(plugin: CompanyGraphPlugin) {
  return StateField.define<Drawn>({
    create: (state) => draw(plugin, state),
    update(drawn, tr: Transaction) {
      const refreshed = tr.effects.some((e) => e.is(refreshNames));
      if (tr.docChanged || refreshed || fileIn(tr.state) !== drawn.path) return draw(plugin, tr.state);
      return drawn;
    },
    provide: (field) => EditorView.decorations.from(field, (drawn) => drawn.marks),
  });
}
