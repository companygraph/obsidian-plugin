// Completion: the cursor's context, the file's type from its path, the candidates for both.
import { EditorSuggest } from "obsidian";
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { contextAt } from "./context.ts";
import { candidatesFor } from "./candidates.ts";
import type { Candidate } from "./candidates.ts";

export class Suggest extends EditorSuggest<Candidate> {
  plugin: CompanyGraphPlugin;

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
    const lines = editor.getValue().split("\n");
    const context = contextAt(lines, cursor.line, cursor.ch);
    if (!context) return null;
    const candidates = candidatesFor(context, vocabulary, this.plugin.names, lines);
    // What is typed is already the one thing on offer: nothing left to complete.
    if (candidates.length === 1 && candidates[0].insert === context.typed) return null;
    return candidates.length ? { context, candidates } : null;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const found = this.find(cursor, editor, file);
    if (!found) return null;
    return { start: { line: cursor.line, ch: found.context.start }, end: cursor, query: found.context.typed };
  }

  getSuggestions(context: EditorSuggestContext): Candidate[] {
    return this.find(context.end, context.editor, context.file)?.candidates ?? [];
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
