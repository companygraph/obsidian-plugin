// Live Preview's Properties widget, reached through the markup themes style it by: a row is
// `.metadata-property[data-property-key]`, and its value sits in `.metadata-property-value`.
// This is markup and not API, which offers nothing here; if it changes, focusing stops and
// nothing else does.
import { MarkdownView } from "obsidian";

// Puts the focus into a field's value. false: the row is not there (yet), so a caller that
// has only just changed the note may try once more; true: done, or there is nothing to do.
export function focusProperty(view: unknown, field: string): boolean {
  if (!(view instanceof MarkdownView) || !/^[\w-]+$/.test(field)) return true;
  const row = view.containerEl.querySelector<HTMLElement>(`.metadata-property[data-property-key="${field}"]`);
  if (!row) return false;
  if (row.offsetParent === null) return true; // not drawn: Source mode, or properties hidden
  row.scrollIntoView({ block: "center" });
  // A row holds the key's input and then the value's; the value is what is being written.
  const editable = '[contenteditable="true"], input';
  (row.querySelector<HTMLElement>(`.metadata-property-value :is(${editable})`) ?? row.querySelector<HTMLElement>(editable))?.focus();
  return true;
}
