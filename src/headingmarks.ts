// The schema's sections, shown on the page. What each heading is and where a missing section
// belongs is headings.ts's; here it is drawn. Four marks, told apart by form and not by colour,
// with Obsidian's own icons: a lock on a required heading, a lock and a remove button on an
// optional one, an open circle on a heading of the page's own, and a dashed line with a plus
// where a required section is missing. A line that spans the page may only come from a state
// field, so this is one, rebuilt when the text changes, when a rebuild sends `refreshNames`, and
// when the editor turns out to hold another file. The tooltip is Obsidian's, shown for any
// element with an aria-label.
import { Notice, editorEditorField, editorInfoField, setIcon } from "obsidian";
import { EditorState as State, RangeSetBuilder, StateField } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { h1Of, headingsOf, insertionAt, isEntityText, lockedLines, lostLine, missingOf, removalRange } from "./headings.ts";
import type { HeadingKind } from "./headings.ts";
import type { TypeVocabulary } from "./vocabulary.ts";
import { refreshNames } from "./namelinks.ts";

// The vocabulary of the entity in the editor, or null where the file is none. Obsidian gives a
// table cell's own small editor the note's extensions and the note's file, read from the
// installed application; such an editor is not the note's own, and its text is a cell.
function vocabularyIn(plugin: CompanyGraphPlugin, state: EditorState): { path: string; vocabulary: TypeVocabulary } | null {
  const info = state.field(editorInfoField, false);
  const own = (info?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
  const view = state.field(editorEditorField, false);
  if (own && view && own !== view) return null;
  const path = info?.file?.path;
  const layout = plugin.layout;
  if (!path || !layout || !path.startsWith(`${layout.model}/`)) return null;
  const type = typeOfPath(path, layout.model);
  const vocabulary = type ? plugin.vocabulary.get(type) : undefined;
  return vocabulary ? { path, vocabulary } : null;
}

// Every widget acts on a press of its own and keeps the press from the editor, so the cursor stays
// where it was and Live Preview does not open the heading's source under it.
function pressable(el: HTMLElement, act: () => void) {
  el.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    act();
  });
}

const lineOf = (view: EditorView, dom: HTMLElement) => view.state.doc.lineAt(view.posAtDOM(dom)).number - 1;

// Removes the section at a line in one transaction, so one undo brings it back. The line is read
// from the page when the command runs, never from when the mark was drawn.
export function removeSection(view: EditorView, vocabulary: TypeVocabulary, line: number) {
  const removal = removalRange(view.state.doc.toString(), line, vocabulary);
  if ("refused" in removal) {
    if (removal.refused === "required") new Notice(`"${removal.heading}" is required by the schema and cannot be removed.`);
    else if (removal.refused === "own") new Notice(`"${removal.heading}" is not in the schema; edit it as any text.`);
    else new Notice("The cursor is in no section.");
    return;
  }
  view.dispatch({ changes: removal, userEvent: "delete.section" });
}

class HeadingMark extends WidgetType {
  readonly plugin: CompanyGraphPlugin;
  readonly kind: HeadingKind;
  readonly heading: string;
  readonly nearMiss: string | null;
  constructor(plugin: CompanyGraphPlugin, kind: HeadingKind, heading: string, nearMiss: string | null) {
    super();
    this.plugin = plugin;
    this.kind = kind;
    this.heading = heading;
    this.nearMiss = nearMiss;
  }
  eq(other: HeadingMark) {
    return other.kind === this.kind && other.heading === this.heading && other.nearMiss === this.nearMiss;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = `companygraph-heading is-${this.kind}`;
    el.setAttribute("contenteditable", "false");
    const icon = el.createSpan({ cls: "companygraph-heading-icon" });
    if (this.kind === "own") {
      setIcon(icon, "circle");
      icon.setAttribute(
        "aria-label",
        this.nearMiss
          ? `Not in the schema, yours to edit. Did you mean "${this.nearMiss}"? Click to rename it.`
          : "Not in the schema, yours to edit.",
      );
      if (this.nearMiss) {
        el.addClass("is-near-miss");
        const nearMiss = this.nearMiss;
        pressable(icon, () => {
          const line = view.state.doc.line(lineOf(view, el) + 1);
          if (!line.text.startsWith("## ")) return;
          view.dispatch({ changes: { from: line.from, to: line.to, insert: `## ${nearMiss}` }, userEvent: "input.section" });
        });
      }
      return el;
    }
    setIcon(icon, "lock");
    if (this.kind === "required") {
      icon.setAttribute("aria-label", "Required by the schema: cannot be renamed or removed.");
      return el;
    }
    icon.setAttribute("aria-label", "Optional: cannot be renamed.");
    const remove = el.createSpan({ cls: "companygraph-heading-remove" });
    setIcon(remove, "x");
    remove.setAttribute("aria-label", "Remove this section");
    pressable(remove, () => {
      const found = vocabularyIn(this.plugin, view.state);
      if (found) removeSection(view, found.vocabulary, lineOf(view, el));
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class MissingLine extends WidgetType {
  readonly heading: string;
  constructor(heading: string) {
    super();
    this.heading = heading;
  }
  eq(other: MissingLine) {
    return other.heading === this.heading;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "companygraph-missing";
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-label", "Required section missing: click to add");
    setIcon(el.createSpan({ cls: "companygraph-missing-icon" }), "plus");
    el.createSpan({ cls: "companygraph-missing-text", text: `## ${this.heading}` });
    pressable(el, () => {
      const at = view.posAtDOM(el);
      const { insert, cursor } = insertionAt(view.state.doc.toString(), at, this.heading);
      view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + cursor }, userEvent: "input.section" });
      view.focus();
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

interface Drawn { path: string | null; marks: DecorationSet }

// The file the editor holds, entity or not: a change of it is what redraws without an edit.
const fileIn = (state: EditorState) => state.field(editorInfoField, false)?.file?.path ?? null;

function draw(plugin: CompanyGraphPlugin, state: EditorState): Drawn {
  const found = vocabularyIn(plugin, state);
  if (!found) return { path: fileIn(state), marks: Decoration.none };
  const doc = state.doc;
  const text = doc.toString();
  if (!isEntityText(text)) return { path: fileIn(state), marks: Decoration.none };
  const lines = text.split("\n");
  const placed: { at: number; decoration: Decoration }[] = [];
  for (const h of headingsOf(lines, found.vocabulary))
    placed.push({
      at: doc.line(h.line + 1).to,
      decoration: Decoration.widget({ widget: new HeadingMark(plugin, h.kind, h.heading, h.nearMiss ?? null), side: 1 }),
    });
  for (const m of missingOf(lines, found.vocabulary)) {
    const atEnd = m.before >= doc.lines;
    placed.push({
      at: atEnd ? doc.length : doc.line(m.before + 1).from,
      decoration: Decoration.widget({ widget: new MissingLine(m.heading), block: true, side: atEnd ? 1 : -1 }),
    });
  }
  // The builder takes ranges in order; at one position a widget before the line comes first.
  placed.sort((a, b) => a.at - b.at || a.decoration.startSide - b.decoration.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const p of placed) builder.add(p.at, p.at, p.decoration);
  return { path: found.path, marks: builder.finish() };
}

export function headingMarks(plugin: CompanyGraphPlugin) {
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

// The lock (spec §8). An edit typed, deleted, pasted or dropped in the editor that loses the H1
// or a declared heading is refused whole, and a notice says which line held it. Compared as the
// locked lines before and after the edit, so typing anywhere else, opening a line before or after
// a heading and moving a heading whole all pass. Only what a person does in the editor is held:
// Obsidian's own changes carry no such event, a file reloaded after a change on disk among them,
// and refusing one would leave the editor out of step with the file. Undo and redo pass, since
// they only take back what was done, and so do this plugin's own commands, which say so by their
// event. A rename in the file explorer, a sync or another plugin never reaches here; the checks
// catch what they break.
const OWN_EVENTS = ["input.section", "delete.section", "undo", "redo"];
const HELD_EVENTS = ["input", "delete", "move"];

// A person's edit, as against Obsidian's own change and this plugin's commands.
const byHand = (tr: Transaction) => !OWN_EVENTS.some((e) => tr.isUserEvent(e)) && HELD_EVENTS.some((e) => tr.isUserEvent(e));

// The H1 as Obsidian last loaded the file: read when the editor is made, again when it holds
// another file, and again after a change that no person typed, such as a reload from disk. What
// is typed never moves it, so the name of an entity that exists is held, and a name being written
// in a new note is free until the note is opened again.
const openedH1 = StateField.define<{ path: string | null; h1: string | null }>({
  create: (state) => ({ path: fileIn(state), h1: h1Of(state.doc.toString().split("\n")) }),
  update(value, tr) {
    const path = fileIn(tr.state);
    if (path !== value.path || (tr.docChanged && !byHand(tr) && !tr.isUserEvent("undo") && !tr.isUserEvent("redo")))
      return { path, h1: h1Of(tr.state.doc.toString().split("\n")) };
    return value;
  },
});

export function headingLock(plugin: CompanyGraphPlugin) {
  let told = 0;
  const filter = State.transactionFilter.of((tr) => {
    if (!tr.docChanged || !byHand(tr)) return tr;
    const found = vocabularyIn(plugin, tr.startState);
    if (!found) return tr;
    const before = tr.startState.doc.toString();
    if (!isEntityText(before)) return tr;
    const opened = tr.startState.field(openedH1, false)?.h1 ?? null;
    const lost = lostLine(
      lockedLines(before.split("\n"), found.vocabulary, opened),
      lockedLines(tr.newDoc.toString().split("\n"), found.vocabulary, opened),
    );
    if (lost === null) return tr;
    // One notice for a burst of refused keystrokes, not one each.
    if (Date.now() - told > 2000) {
      told = Date.now();
      new Notice(
        lost.startsWith("## ")
          ? `"${lost.slice(3).trim()}" is the schema's heading and cannot be edited here.`
          : "The H1 is the entity's name and cannot be edited here.",
      );
    }
    return [];
  });
  return [openedH1, filter];
}
