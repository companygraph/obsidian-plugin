// Completion: the cursor's context, the file's type from its path, the candidates for both.
import { EditorSuggest } from "obsidian";
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { contextAt } from "./context.ts";
import type { Context } from "./context.ts";
import { candidatesFor } from "./candidates.ts";
import type { Candidate } from "./candidates.ts";

export class Suggest extends EditorSuggest<Candidate> {
  plugin: CompanyGraphPlugin;
  // What onTrigger last found, for getSuggestions to read straight back: Obsidian calls it only
  // after an onTrigger that returned non-null, for the same position, so find() need not run twice.
  found: { context: Context; candidates: Candidate[] } | null = null;

  constructor(app: App, plugin: CompanyGraphPlugin) {
    super(app);
    this.plugin = plugin;
  }

  find(cursor: EditorPosition, editor: Editor, file: TFile | null) {
    const layout = this.plugin.layout;
    if (!layout || !file || !file.path.startsWith(layout.model + "/")) return null;
    const type = typeOfPath(file.path, layout.model);
    const vocabulary = type ? this.plugin.vocabulary.get(type) : undefined;
    if (!vocabulary) return null;

    // The API's own note on onTrigger: "Please be mindful of performance when implementing this
    // function, as it will be triggered very often (on each keypress). Keep it simple, and
    // return null as early as possible." A heading or a table row is decided on its own line;
    // anything else can only be a context inside frontmatter, which is rejected here without
    // paying for a full-document stringify and split on every ordinary keypress in the body.
    const text = editor.getLine(cursor.line).slice(0, cursor.ch);
    if (!text.startsWith("## ") && !text.trimStart().startsWith("|")) {
      if (editor.getLine(0) !== "---") return null;
      for (let i = 1; i < cursor.line; i++) if (editor.getLine(i) === "---") return null;
    }

    const lines = editor.getValue().split("\n");
    const context = contextAt(lines, cursor.line, cursor.ch);
    if (!context) return null;
    const candidates = candidatesFor(context, vocabulary, this.plugin.names, lines);
    // What is typed is already the one thing on offer: nothing left to complete.
    if (candidates.length === 1 && candidates[0].insert === context.typed) return null;
    return candidates.length ? { context, candidates } : null;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    this.found = this.find(cursor, editor, file);
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
    const inserted = candidate.insert.split("\n");
    const last = inserted[inserted.length - 1];
    editor.setCursor(
      inserted.length === 1
        ? { line: start.line, ch: start.ch + last.length }
        : { line: start.line + inserted.length - 1, ch: last.length },
    );
  }
}
