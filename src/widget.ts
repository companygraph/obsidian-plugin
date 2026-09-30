// Live Preview's Properties widget, reached through the markup themes style it by: a row is
// `.metadata-property[data-property-key]`, and its value sits in `.metadata-property-value`.
// This is markup and not API, which offers nothing here; if it changes, focusing stops and
// nothing else does.
import { MarkdownView, Notice } from "obsidian";
import type { TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { propertiesWrite } from "./headingmarks.ts";
import { isEntityText } from "./headings.ts";
import { idOf, lostId } from "./idlock.ts";

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

// The lock on the page's `id` (spec §8), where the Properties widget edits it. The pure half is
// idlock.ts; the refusal of an edit in the note's editor is headingmarks.ts's transaction filter.
// Read from the installed application, Obsidian 1.13.7, and none of it API:
//
// - In a note, the widget writes through the editor. `MarkdownView.saveFrontmatter` rewrites the
//   frontmatter in the text and hands it to the editor, which dispatches the difference with the
//   event `set`, the event of a file reloaded from disk; then it saves the editor to the file. So
//   the write is flagged while it runs, and the filter holds it as it holds typing. A refused
//   write leaves the widget showing what was refused, so it is drawn again from the editor.
// - The core Properties pane in the sidebar writes the file itself, through `vault.process`, and
//   the note's editor then takes the change as a reload, which must pass. So there the write is
//   held before it reaches the file, and the pane is drawn again from the file.
//
// Where any of this changes, the note's own filter still holds Source mode and the checks still
// run; the widget and the pane stop being held.
const ID_VALUE = '.metadata-property[data-property-key="id"] .metadata-property-value';
const REFUSED = `"id" is the entity's identity and cannot be edited here.`;

type Save = (this: unknown, frontmatter: unknown) => void;

// Wraps a prototype's saveFrontmatter for the plugin's life, and puts it back on unload unless
// something else has wrapped it since.
function wrapSave(plugin: CompanyGraphPlugin, proto: object, make: (original: Save) => Save): boolean {
  const own = proto as { saveFrontmatter?: Save };
  const original = own.saveFrontmatter;
  if (typeof original !== "function") return false;
  const wrapped = make(original);
  own.saveFrontmatter = wrapped;
  plugin.register(() => {
    if (own.saveFrontmatter === wrapped) own.saveFrontmatter = original;
  });
  return true;
}

// Whether a file is an entity's page, as the heading lock decides it for an editor.
function isEntityFile(plugin: CompanyGraphPlugin, path: string, text: string): boolean {
  const layout = plugin.layout;
  if (!layout || !path.startsWith(`${layout.model}/`)) return false;
  const type = typeOfPath(path, layout.model);
  return !!type && plugin.vocabulary.has(type) && isEntityText(text);
}

interface PaneView {
  file?: TFile | null;
  rawFrontmatter?: string | null;
  onQuickPreview?: (file: TFile, text: string) => void;
}

const panesWrapped = new WeakSet<object>();

// The sidebar pane's class is a core plugin's and exported nowhere, so it is reached through a
// pane that is open, once.
function holdPane(plugin: CompanyGraphPlugin) {
  const view = plugin.app.workspace.getLeavesOfType("file-properties")[0]?.view;
  const proto = view ? Object.getPrototypeOf(view) : null;
  if (!proto || panesWrapped.has(proto)) return;
  panesWrapped.add(proto);
  wrapSave(plugin, proto, (original) => function (this: unknown, frontmatter: unknown) {
    const pane = this as PaneView;
    const vault = plugin.app.vault;
    const own = Object.prototype.hasOwnProperty.call(vault, "process");
    const process = vault.process;
    vault.process = ((file: TFile, fn: (text: string) => string, options?: object) =>
      process.call(vault, file, (text: string) => {
        const next = fn(text);
        if (!isEntityFile(plugin, file.path, text) || lostId(idOf(text), next) === null) return next;
        new Notice(REFUSED);
        // Drawn again from the file as it stays: the pane skips a text it believes it has.
        pane.rawFrontmatter = null;
        pane.onQuickPreview?.(file, text);
        return text;
      }, options)) as typeof vault.process;
    try {
      original.call(this, frontmatter);
    } finally {
      if (own) vault.process = process;
      else delete (vault as { process?: unknown }).process;
    }
  });
}

export function holdIdInProperties(plugin: CompanyGraphPlugin) {
  wrapSave(plugin, MarkdownView.prototype, (original) => function (this: unknown, frontmatter: unknown) {
    propertiesWrite.active = true;
    propertiesWrite.refused = false;
    try {
      original.call(this, frontmatter);
    } finally {
      propertiesWrite.active = false;
      if (propertiesWrite.refused && this instanceof MarkdownView) {
        propertiesWrite.refused = false;
        (this as unknown as { loadFrontmatter?: (text: string) => void }).loadFrontmatter?.(this.editor.getValue());
      }
    }
  });
  plugin.app.workspace.onLayoutReady(() => holdPane(plugin));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", () => holdPane(plugin)));

  // The row's value takes no focus while the page's id is held: a click or a Tab into it is
  // turned away and says why. The editor carries the attribute; headingmarks.ts sets it.
  let told = 0;
  plugin.registerDomEvent(document, "focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(`[data-companygraph-id="locked"] ${ID_VALUE}`)) return;
    target.blur();
    if (Date.now() - told > 2000) {
      told = Date.now();
      new Notice(REFUSED);
    }
  }, { capture: true });
}
