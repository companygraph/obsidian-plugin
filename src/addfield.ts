// Adding a field from the Properties widget. Obsidian's own "Add property" lists every
// property name used anywhere in the vault and knows no schema, so it offers a long list in
// which a field no file uses yet does not appear at all. This picker holds exactly the fields
// this file's schema declares and the file lacks, which a pure module decides.
import { FuzzySuggestModal } from "obsidian";
import type { App, MarkdownView, TFile } from "obsidian";
import type { Field } from "./vocabulary.ts";
import { focusProperty } from "./widget.ts";

export class AddField extends FuzzySuggestModal<Field> {
  file: TFile;
  view: MarkdownView;
  fields: Field[];

  constructor(app: App, file: TFile, view: MarkdownView, fields: Field[]) {
    super(app);
    this.file = file;
    this.view = view;
    this.fields = fields;
    this.setPlaceholder("A field this file may still take");
  }

  getItems() { return this.fields; }
  getItemText(field: Field) { return field.required ? `${field.name} (required)` : field.name; }

  onChooseItem(field: Field) {
    // Obsidian's own writer of frontmatter, so the file is changed the way the widget changes
    // it. The value is left empty: a list written as `[]` would be the flow sequence R11 forbids.
    void this.app.fileManager
      .processFrontMatter(this.file, (frontmatter) => {
        if (!(field.name in frontmatter)) frontmatter[field.name] = null;
      })
      .then(() => {
        // The widget draws the new row a moment after the file changes.
        if (!focusProperty(this.view, field.name)) window.setTimeout(() => focusProperty(this.view, field.name), 200);
      });
  }
}
