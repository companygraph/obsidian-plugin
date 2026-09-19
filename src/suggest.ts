// Completion: the cursor's context, the file's type from its path, the candidates for both.
import { EditorSuggest } from "obsidian";
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { contextAt, mayHoldContext } from "./context.ts";
import type { Context } from "./context.ts";
import { candidatesFor, cursorAfter, entersThrough } from "./candidates.ts";
import type { Candidate } from "./candidates.ts";
import { cellContextOf } from "./tables.ts";
import { namesIn } from "./scope.ts";
import { editedCell } from "./livetable.ts";

export class Suggest extends EditorSuggest<Candidate> {
  plugin: CompanyGraphPlugin;
  // What onTrigger last found, for getSuggestions to read straight back: Obsidian calls it only
  // after an onTrigger that returned non-null, for the same position, so find() need not run twice.
  found: { context: Context; candidates: Candidate[] } | null = null;
  // Set by the command Complete here; read once. It matters only where Enter could not be put
  // first, since there an empty entry stays quiet unless it is asked.
  asked = false;
  // Whether this suggest's keys run before the chooser's own.
  enterFirst = false;
  // Whether an arrow key has moved in the list since it was last asked for: that is choosing.
  navigated = false;

  constructor(app: App, plugin: CompanyGraphPlugin) {
    super(app);
    this.plugin = plugin;
    // The keys. The chooser bound its own when the popup was built, and a scope runs the first
    // handler that matches, so these are moved to the front of the scope's list, which is not in
    // the public types. Read from the installed application: a handler that returns anything but
    // false lets the key through to the editor. If the list cannot be reached, `enterFirst` stays
    // false and an empty entry or cell offers nothing, rather than take a key that is the editor's.
    type Chooser = { useSelectedItem?: (e: KeyboardEvent) => void; moveUp?: (e: KeyboardEvent) => unknown; moveDown?: (e: KeyboardEvent) => unknown };
    const chooser = () => (this as unknown as { suggestions?: Chooser }).suggestions;
    const accept = (event: KeyboardEvent) => {
      if (this.found && entersThrough(this.found.context, this.navigated)) {
        this.close();
        return true;
      }
      chooser()?.useSelectedItem?.(event);
      return false;
    };
    const move = (down: boolean) => (event: KeyboardEvent) => {
      this.navigated = true;
      if (down) chooser()?.moveDown?.(event);
      else chooser()?.moveUp?.(event);
      return false;
    };
    const ours = [
      this.scope.register([], "Enter", accept),
      this.scope.register([], "Tab", accept),
      this.scope.register([], "ArrowDown", move(true)),
      this.scope.register([], "ArrowUp", move(false)),
    ];
    const keys = (this.scope as unknown as { keys?: unknown[] }).keys;
    if (Array.isArray(keys) && ours.every((entry) => keys.includes(entry))) {
      for (const entry of ours) keys.splice(keys.indexOf(entry), 1);
      keys.unshift(...ours);
      this.enterFirst = true;
    } else {
      // Tab is not bound by Obsidian, so it may stay where it is; the other three would only
      // shadow nothing and are taken back.
      for (const entry of ours) if (entry !== ours[1]) this.scope.unregister(entry);
    }
  }

  // Completion on demand. Obsidian opens a suggest only from its own keypress handling; the
  // method that does it is not in the public types, so it is called optionally, and without
  // it the command does nothing rather than something wrong.
  ask(editor: Editor, file: TFile | null) {
    this.asked = true;
    // Read from the installed application: the workspace keeps a manager of every suggest, whose
    // trigger(editor, file, true) asks each in turn and makes the one that answers current; a
    // suggest's own trigger does the asking without the bookkeeping. The manager where there is
    // one, the suggest's own otherwise, nothing if neither.
    type Trigger = { trigger?: (editor: Editor, file: TFile | null, open: boolean) => void };
    const manager = (this.app.workspace as unknown as { editorSuggest?: Trigger }).editorSuggest;
    // The manager does nothing unless the editor has the focus, and run from the command palette
    // the focus may not be back in it yet.
    editor.focus();
    if (typeof manager?.trigger === "function") manager.trigger(editor, file, true);
    else (this as unknown as Trigger).trigger?.(editor, file, true);
    this.asked = false;
  }

  find(cursor: EditorPosition, editor: Editor, file: TFile | null, asked = false) {
    const layout = this.plugin.layout;
    if (!layout || !file || !file.path.startsWith(layout.model + "/")) return null;
    const type = typeOfPath(file.path, layout.model);
    const vocabulary = type ? this.plugin.vocabulary.get(type) : undefined;
    if (!vocabulary) return null;

    // A cell of a table in Live Preview is edited in an editor of its own, whose text is the
    // cell's alone; which row and column it is comes from Obsidian's table object.
    const cell = editedCell(this.app, editor);
    if (cell) {
      const context = cellContextOf({ ...cell, lines: editor.lineCount(), line: editor.getLine(cursor.line), ch: cursor.ch });
      if (!context) return null;
      if (entersThrough(context) && !this.enterFirst && !asked) return null;
      const candidates = candidatesFor(context, vocabulary, namesIn(this.plugin.named, file.path, layout.model), []);
      return candidates.length ? { context, candidates } : null;
    }

    // The API's own note on onTrigger: "Please be mindful of performance when implementing this
    // function, as it will be triggered very often (on each keypress). Keep it simple, and
    // return null as early as possible." The reject reads single lines, so nothing pays for a
    // full-document stringify and split on an ordinary keypress in the body.
    if (!mayHoldContext((n) => editor.getLine(n), cursor.line, cursor.ch)) return null;

    const lines = editor.getValue().split("\n");
    const context = contextAt(lines, cursor.line, cursor.ch);
    if (!context) return null;
    // candidatesFor decides everything, including that what is typed is already complete.
    // An empty entry shows its names only where its Enter can be let through.
    if (entersThrough(context) && !this.enterFirst && !asked) return null;
    // The names this file may use: an owned type's are its owner's own, as core 0.30.1 holds.
    const candidates = candidatesFor(context, vocabulary, namesIn(this.plugin.named, file.path, layout.model), lines);
    return candidates.length ? { context, candidates } : null;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const asked = this.asked;
    this.asked = false;
    this.navigated = false;
    this.found = this.find(cursor, editor, file, asked);
    if (!this.found) return null;
    return { start: { line: cursor.line, ch: this.found.context.start }, end: cursor, query: this.found.context.typed };
  }

  getSuggestions(context: EditorSuggestContext): Candidate[] {
    return this.found?.candidates ?? [];
  }

  renderSuggestion(candidate: Candidate, el: HTMLElement) {
    el.setText(candidate.label);
  }

  selectSuggestion(candidate: Candidate) {
    if (!this.context) return;
    const { editor, start, end } = this.context;
    editor.replaceRange(candidate.insert, start, end);
    editor.setCursor(cursorAfter(start, candidate.insert));
  }
}
