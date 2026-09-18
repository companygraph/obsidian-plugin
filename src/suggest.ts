// Completion: the cursor's context, the file's type from its path, the candidates for both.
import { EditorSuggest } from "obsidian";
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { contextAt, mayHoldContext } from "./context.ts";
import type { Context } from "./context.ts";
import { candidatesFor, cursorAfter } from "./candidates.ts";
import type { Candidate } from "./candidates.ts";

export class Suggest extends EditorSuggest<Candidate> {
  plugin: CompanyGraphPlugin;
  // What onTrigger last found, for getSuggestions to read straight back: Obsidian calls it only
  // after an onTrigger that returned non-null, for the same position, so find() need not run twice.
  found: { context: Context; candidates: Candidate[] } | null = null;
  // Set by the command that asks for completion where it otherwise stays quiet; read once.
  asked = false;

  constructor(app: App, plugin: CompanyGraphPlugin) {
    super(app);
    this.plugin = plugin;
    // Enter accepts by Obsidian's own default and Tab does not. The chooser that holds the
    // selection is not in the public types; plugins reach it this way, and if it ever goes the
    // optional call leaves Tab doing what it did before.
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

    // The API's own note on onTrigger: "Please be mindful of performance when implementing this
    // function, as it will be triggered very often (on each keypress). Keep it simple, and
    // return null as early as possible." The reject reads single lines, so nothing pays for a
    // full-document stringify and split on an ordinary keypress in the body.
    if (!mayHoldContext((n) => editor.getLine(n), cursor.line, cursor.ch)) return null;

    const lines = editor.getValue().split("\n");
    const context = contextAt(lines, cursor.line, cursor.ch);
    if (!context) return null;
    // candidatesFor decides everything, including that what is typed is already complete.
    const candidates = candidatesFor(context, vocabulary, this.plugin.names, lines, asked);
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
