// Names that act as links. Which spans of a file are references, and what each names, is
// references.ts's; here they are found on the screen and marked. In Source mode a CodeMirror
// decoration styles the span; in Live Preview a Properties value or pill and a table cell are
// marked in place, found by the markup themes style them by, which is not API: if it changes,
// the marks there stop and nothing else does. Every mark that resolves carries the path of the
// entity it names, which is what a Cmd+click opens (main.ts).
import { MarkdownView, editorInfoField } from "obsidian";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { tableOf, typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { referencesIn, resolveIn } from "./references.ts";
import { sectionAbove } from "./tables.ts";

// Sent after a rebuild, since what a name resolves to can change without the text changing.
export const refreshNames = StateEffect.define<null>();

const MARK = "data-companygraph-name";
const PATH = "data-companygraph-path";

// The vocabulary of the entity in `path`, and what a name there resolves to.
function resolverFor(plugin: CompanyGraphPlugin, path: string | undefined) {
  const layout = plugin.layout;
  if (!path || !layout || !path.startsWith(`${layout.model}/`)) return null;
  const type = typeOfPath(path, layout.model);
  const vocabulary = type ? plugin.vocabulary.get(type) : undefined;
  if (!vocabulary) return null;
  return { vocabulary, resolve: (target: string, name: string) => resolveIn(plugin.named, path, layout.model, target, name) };
}

export function nameLinks(plugin: CompanyGraphPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshNames))))
          this.decorations = this.build(update.view);
      }
      build(view: EditorView): DecorationSet {
        const resolver = resolverFor(plugin, view.state.field(editorInfoField, false)?.file?.path);
        if (!resolver) return Decoration.none;
        const doc = view.state.doc;
        const builder = new RangeSetBuilder<Decoration>();
        const refs = referencesIn(doc.toString().split("\n"), resolver.vocabulary)
          .filter((r) => r.line < doc.lines)
          .map((r) => ({ ...r, at: doc.line(r.line + 1).from }))
          .sort((a, b) => a.at + a.from - (b.at + b.from));
        for (const ref of refs) {
          const path = resolver.resolve(ref.target, ref.name);
          builder.add(
            ref.at + ref.from,
            ref.at + ref.to,
            Decoration.mark({
              class: path ? "companygraph-ref" : "companygraph-ref is-unresolved",
              attributes: path ? { [PATH]: path } : {},
            }),
          );
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// The Live Preview places: a Properties value or pill, and a cell of a table widget.
export function markNames(plugin: CompanyGraphPlugin, view: MarkdownView, cm: EditorView | undefined) {
  const root = view.containerEl;
  for (const old of Array.from(root.querySelectorAll<HTMLElement>(`[${MARK}]`))) {
    old.removeAttribute(MARK);
    old.removeAttribute(PATH);
    old.removeClass("companygraph-ref", "is-unresolved");
  }
  const resolver = resolverFor(plugin, view.file?.path);
  if (!resolver) return;
  const mark = (el: Element | null, target: string, name: string | null | undefined) => {
    const text = (name ?? "").trim();
    if (!el || !text) return;
    const path = resolver.resolve(target, text);
    el.setAttribute(MARK, "");
    el.addClass("companygraph-ref");
    if (path) el.setAttribute(PATH, path);
    else el.addClass("is-unresolved");
  };

  for (const row of Array.from(root.querySelectorAll<HTMLElement>(".metadata-property[data-property-key]"))) {
    const field = resolver.vocabulary.fields.find((f) => f.name === row.dataset.propertyKey);
    if (!field || field.offer.kind !== "names") continue;
    const target = field.offer.target;
    // Not Obsidian's own `internal-link` class: a pill carrying it is opened by Obsidian as a link
    // to a note of that file name, which a canonical name is not, and would make one.
    for (const pill of Array.from(row.querySelectorAll(".multi-select-pill")))
      mark(pill, target, pill.querySelector(".multi-select-pill-content")?.textContent);
    if (!field.list) {
      const value = row.querySelector(".metadata-property-value .metadata-input-longtext");
      mark(value, target, value?.textContent);
    }
  }

  if (!cm) return;
  const note = view.editor;
  for (const widget of Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget"))) {
    let first: number;
    try {
      first = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
    } catch {
      continue;
    }
    const columns = resolver.vocabulary.sections.find((s) => s.heading === sectionAbove((n) => note.getLine(n), first - 1))?.columns;
    if (!columns) continue;
    let last = first;
    while (last + 1 < note.lineCount() && note.getLine(last + 1).trimStart().startsWith("|")) last++;
    const block: string[] = [];
    for (let n = first; n <= last; n++) block.push(note.getLine(n));
    const header = tableOf(block.join("\n"))?.columns;
    if (!header) continue;
    Array.from(widget.querySelectorAll("tr")).slice(1).forEach((tr) =>
      Array.from(tr.children).forEach((cell, i) => {
        const column = columns.find((c) => c.name === header[i]);
        if (column?.offer.kind === "names") mark(cell, column.offer.target, cell.textContent);
      }),
    );
  }
}

// What a Cmd+click lands on, if it names an entity that resolves.
export const namedPath = (target: EventTarget | null): string | null =>
  target instanceof Element ? target.closest(`[${PATH}]`)?.getAttribute(PATH) ?? null : null;
