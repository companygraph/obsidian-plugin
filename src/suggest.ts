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
import { editedCell } from "./livetable.ts";

export class Suggest extends EditorSuggest<Candidate> {
  plugin: CompanyGraphPlugin;
  // What onTrigger last found, for getSuggestions to read straight back: Obsidian calls it only
  // after an onTrigger that returned non-null, for the same position, so find() need not run twice.
  found: { context: Context; candidates: Candidate[] } | null = null;
  // Set by the command Complete here; read once. It matters only where Enter could not be put
  // first, since there an empty entry stays quiet unless it is asked.
  asked = false;
  // Whether this suggest's Enter runs before the chooser's own.
  enterFirst = false;

  constructor(app: App, plugin: CompanyGraphPlugin) {
    super(app);
    this.plugin = plugin;
    // Enter accepts by Obsidian's own default and Tab does not. The chooser that holds the
    // selection is not in the public types; plugins reach it this way, and if it ever goes the
    // optional call leaves Tab doing what it did before.
    // Enter. The chooser bound its own when the popup was built, and a scope runs the first
    // handler that matches, so this one is moved to the front of the scope's list, which is not
    // in the public types. Read from the installed application: a handler that returns anything
    // but false lets the key through to the editor. If the list cannot be reached, `enterFirst`
    // stays false and an empty entry offers nothing, as before, rather than take an Enter.
    const entry = this.scope.register([], "Enter", (event) => {
      if (this.found && entersThrough(this.found.context)) {
        this.close();
        return true;
      }
      const chooser = (this as unknown as { suggestions?: { useSelectedItem?: (e: KeyboardEvent) => void } }).suggestions;
      chooser?.useSelectedItem?.(event);
      return false;
    });
    const keys = (this.scope as unknown as { keys?: unknown[] }).keys;
    if (Array.isArray(keys) && keys.includes(entry)) {
      keys.splice(keys.indexOf(entry), 1);
      keys.unshift(entry);
      this.enterFirst = true;
    } else {
      this.scope.unregister(entry);
    }
    this.scope.register([], "Tab", (event) => {
      const chooser = (this as unknown as { suggestions?: { useSelectedItem?: (e: KeyboardEvent) => void } }).suggestions;
      chooser?.useSelectedItem?.(event);
      return false;
    });
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
    // cell's and holds no pipe; which column it is comes from Obsidian's table object.
    const cell = editedCell(this.app, editor);
    if (cell) {
      const context = cellContextOf({ ...cell, line: editor.getLine(cursor.line), ch: cursor.ch });
      if (!context) return null;
      if (entersThrough(context) && !this.enterFirst && !asked) return null;
      const candidates = candidatesFor(context, vocabulary, this.plugin.names, []);
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
    const candidates = candidatesFor(context, vocabulary, this.plugin.names, lines);
    return candidates.length ? { context, candidates } : null;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const asked = this.asked;
    this.asked = false;
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
