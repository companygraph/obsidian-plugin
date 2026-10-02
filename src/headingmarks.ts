// The schema's sections, shown on the page. What each heading is and where a missing section
// belongs is headings.ts's; here it is drawn. Four marks, told apart by form and not by colour,
// with Obsidian's own icons: a lock on a required heading, a lock and a remove button on an
// optional one, an open circle on a heading of the page's own, and a dashed line with a plus
// where a required section is missing. A line that spans the page may only come from a state
// field, so this is one, rebuilt when the text changes, when a rebuild sends `refreshNames`, and
// when the editor turns out to hold another file. The tooltip is Obsidian's, shown for any
// element with an aria-label.
import { MarkdownView, Notice, editorEditorField, editorInfoField, setIcon } from "obsidian";
import { EditorState as State, RangeSetBuilder, StateField, Transaction as Tr } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { typeOf } from "./model.ts";
import type CompanyGraphPlugin from "./main.ts";
import { headingsOf, insertionAt, isEntityText, isHeld, lockedLines, lostLine, missingOf, removalRange, tableStart } from "./headings.ts";
import type { HeadingKind } from "./headings.ts";
import type { TypeVocabulary } from "./vocabulary.ts";
import { refreshNames } from "./namelinks.ts";
import { containerMark, heldAfter, holdsEdit, idOf, lostId, tells } from "./idlock.ts";
import type { Held, Told } from "./idlock.ts";

// The vocabulary of the entity in the editor, or null where the file is none. Obsidian gives a
// table cell's own small editor the note's extensions and the note's file, read from the
// installed application; such an editor is not the note's own, and its text is a cell.
function vocabularyIn(plugin: CompanyGraphPlugin, state: EditorState): { path: string; vocabulary: TypeVocabulary } | null {
  const info = state.field(editorInfoField, false);
  // `editor` is a getter of Obsidian's, and on a release as old as the manifest promises it
  // throws while the view is still being built: the editor it reaches for is not there yet, and
  // no note could be opened at all. Where it cannot answer, nothing is known about a cell's own
  // editor and the file alone decides, as it did before this field was read. Found by the suite
  // under e2e/ against Obsidian 1.5.3.
  let own: EditorView | undefined;
  try {
    own = (info?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
  } catch {
    own = undefined;
  }
  const view = state.field(editorEditorField, false);
  if (own && view && own !== view) return null;
  const path = info?.file?.path;
  const layout = plugin.layout;
  if (!path || !layout || !path.startsWith(`${layout.model}/`)) return null;
  const type = typeOf(path, layout);
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
  // A table section's header, written with the heading, as Add a section writes it.
  readonly body: string[];
  constructor(heading: string, body: string[]) {
    super();
    this.heading = heading;
    this.body = body;
  }
  eq(other: MissingLine) {
    return other.heading === this.heading && other.body.join("\n") === this.body.join("\n");
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
      const { insert, cursor } = insertionAt(view.state.doc.toString(), at, this.heading, this.body);
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
      decoration: Decoration.widget({
        widget: new MissingLine(m.heading, tableStart(found.vocabulary.sections.find((d) => d.heading === m.heading)!)),
        block: true,
        side: atEnd ? 1 : -1,
      }),
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

// The lock (spec §8). An edit that loses a declared heading is refused whole, and one notice for
// a burst of keystrokes says which heading held it. Compared as the declared headings before and
// after the edit, so typing anywhere else, the H1 included, opening a line before or after a
// heading and moving a heading whole all pass. Which edits are held is decided in headings.ts,
// where it is tested. A rename in the file explorer, a sync or another program never reaches the
// editor; the checks catch what they break.
//
// The same filter holds the page's `id` once it has a value: an edit that changes or removes it
// is refused, whether typed in Source mode or written by the Properties widget, which reaches the
// editor as a transaction of its own (see widget.ts). What is held and when is idlock.ts's.
const eventOf = (tr: Transaction) => tr.annotation(Tr.userEvent);

// Set by widget.ts while the Properties widget writes the note, which it does through the editor
// with the event `set`, the event of a reload from disk; `refused` says the lock held that write.
export const propertiesWrite = { active: false, refused: false };

// The notice of either lock, once for a burst of refused keystrokes and not once each. One record
// for the editor, the widget and its row, so one refusal seen from two sides says so once; when
// it is told is idlock.ts's `tells`.
let told: Told | null = null;
export function tellLocked(message: string) {
  const now = Date.now();
  if (tells(told, message, now)) {
    told = { message, at: now };
    new Notice(message);
  }
}
export const ID_REFUSED = `"id" is the entity's identity and cannot be edited here.`;

// The id the lock holds in one editor, and whether the page is an entity's with that id set, which
// is what makes the Properties widget's row for it read-only. A field, and not a reading of the
// text, because the id held is the page's as the editor took it from the file: typing into a
// blank id does not lock it while it is written.
interface IdHold extends Held { locked: boolean; path: string | null }

function holdOf(plugin: CompanyGraphPlugin, state: EditorState, hold: Held): IdHold {
  const locked = !!hold.held && vocabularyIn(plugin, state) !== null && isEntityText(state.doc.toString());
  return { ...hold, locked, path: fileIn(state) };
}

const LOCKED = "data-companygraph-id";

// The row is drawn locked by an attribute on the view's container, which holds the widget in
// Live Preview and in Reading view alike; styles.css draws it and widget.ts guards its focus. Set
// only by the editor of a note's own view: the editor field names the view, and the view's editor
// must be this one. A canvas's node editors share one container and a table cell's editor sits
// inside the note's, and neither touches it.
function ownView(v: EditorView): MarkdownView | null {
  const info = v.state.field(editorInfoField, false);
  if (!(info instanceof MarkdownView)) return null;
  let cm: EditorView | undefined;
  try {
    cm = (info.editor as unknown as { cm?: EditorView } | undefined)?.cm;
  } catch {
    cm = undefined;
  }
  return cm === v ? info : null;
}

function markContainer(field: StateField<IdHold>) {
  return ViewPlugin.define((view) => {
    let container: Element | null = null;
    // What was last done, so an update that changes nothing touches no markup: this runs on every
    // transaction of the editor.
    let last: "set" | "remove" | null = null;
    const mark = (v: EditorView) => {
      const own = ownView(v);
      const action = containerMark(!!v.state.field(field, false)?.locked, own !== null);
      if (action === "leave") return;
      if (action === last && container === own!.containerEl) return;
      container = own!.containerEl;
      last = action;
      if (action === "set") container.setAttribute(LOCKED, "locked");
      else container.removeAttribute(LOCKED);
    };
    mark(view);
    return {
      update: (update) => mark(update.view),
      destroy: () => container?.removeAttribute(LOCKED),
    };
  });
}

export function idHold(plugin: CompanyGraphPlugin) {
  return StateField.define<IdHold>({
    create: (state) => {
      const held = idOf(state.doc.toString());
      return holdOf(plugin, state, { held, before: held });
    },
    update(hold, tr: Transaction) {
      const refreshed = tr.effects.some((e) => e.is(refreshNames));
      if (!tr.docChanged && !refreshed && fileIn(tr.state) === hold.path) return hold;
      const next = tr.docChanged ? heldAfter(hold, eventOf(tr), tr.newDoc.toString()) : hold;
      return holdOf(plugin, tr.state, { held: next.held, before: next.before });
    },
    provide: (field) => markContainer(field),
  });
}

export function headingLock(plugin: CompanyGraphPlugin, ids: StateField<IdHold>) {
  const filter = State.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    const event = eventOf(tr);
    const headings = isHeld(event);
    const id = holdsEdit(event, propertiesWrite.active);
    if (!headings && !id) return tr;
    const found = vocabularyIn(plugin, tr.startState);
    if (!found) return tr;
    const before = tr.startState.doc.toString();
    if (!isEntityText(before)) return tr;
    const after = tr.newDoc.toString();
    if (headings) {
      const lost = lostLine(lockedLines(before.split("\n"), found.vocabulary), lockedLines(after.split("\n"), found.vocabulary));
      if (lost !== null) {
        tellLocked(`"${lost.slice(3).trim()}" is the schema's heading and cannot be edited here.`);
        return [];
      }
    }
    if (id && lostId(tr.startState.field(ids, false)?.held ?? null, after) !== null) {
      if (propertiesWrite.active) propertiesWrite.refused = true;
      tellLocked(ID_REFUSED);
      return [];
    }
    return tr;
  });
  return filter;
}
