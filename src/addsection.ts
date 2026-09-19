// Add a section (spec §8): a picker of the declared sections the page lacks, required ones marked,
// that writes the chosen heading where the schema puts it, a table section with its header. The
// sections the page lacks and where each goes are headings.ts's. The write carries the plugin's own
// event, so the lock on declared headings lets it through.
import { FuzzySuggestModal } from "obsidian";
import type { App } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { SectionDecl, TypeVocabulary } from "./vocabulary.ts";
import { addableSections, insertionAt, placementOf, tableStart } from "./headings.ts";

// Writes a declared section's heading where it belongs and puts the cursor where its text starts.
export function writeSection(view: EditorView, vocabulary: TypeVocabulary, section: SectionDecl) {
  const doc = view.state.doc;
  const text = doc.toString();
  const before = placementOf(text.split("\n"), vocabulary, section.heading);
  const at = before < doc.lines ? doc.line(before + 1).from : doc.length;
  const { insert, cursor } = insertionAt(text, at, section.heading, tableStart(section));
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + cursor }, userEvent: "input.section", scrollIntoView: true });
  view.focus();
}

export class AddSection extends FuzzySuggestModal<SectionDecl> {
  view: EditorView;
  vocabulary: TypeVocabulary;

  constructor(app: App, view: EditorView, vocabulary: TypeVocabulary) {
    super(app);
    this.view = view;
    this.vocabulary = vocabulary;
    this.setPlaceholder("A section this page may still take");
  }

  getItems(): SectionDecl[] {
    return addableSections(this.view.state.doc.toString().split("\n"), this.vocabulary);
  }
  getItemText(section: SectionDecl) {
    return section.required ? `${section.heading} (required)` : section.heading;
  }
  onChooseItem(section: SectionDecl) {
    writeSection(this.view, this.vocabulary, section);
  }
}
