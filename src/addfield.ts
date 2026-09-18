// Adding a field from the Properties widget. Obsidian's own "Add property" lists every
// property name used anywhere in the vault and knows no schema, so it offers a long list in
// which a field no file uses yet does not appear at all. This picker holds exactly the fields
// this file's schema declares and the file lacks, which a pure module decides.
import { FuzzySuggestModal } from "obsidian";
import type { App, MarkdownView, TFile } from "obsidian";
import type { Field } from "./vocabulary.ts";
import { focusProperty } from "./widget.ts";

// The last entry of the picker: Obsidian's own list, for a property the schema does not declare.
// The picker is opened in place of that list, so it must never be the only way on.
const OTHER = "other";
type Item = Field | typeof OTHER;

export class AddField extends FuzzySuggestModal<Item> {
  file: TFile;
  view: MarkdownView;
  fields: Field[];
  other: (() => void) | null;

  constructor(app: App, file: TFile, view: MarkdownView, fields: Field[], other: (() => void) | null = null) {
    super(app);
    this.file = file;
    this.view = view;
    this.fields = fields;
    this.other = other;
    this.setPlaceholder(fields.length ? "A field this file may still take" : "This file has every field its schema declares");
  }

  getItems(): Item[] { return this.other ? [...this.fields, OTHER] : this.fields; }
  getItemText(item: Item) {
    if (item === OTHER) return "Another property (not declared by the schema)";
    return item.required ? `${item.name} (required)` : item.name;
  }

  onChooseItem(field: Item) {
    if (field === OTHER) return this.other?.();
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
