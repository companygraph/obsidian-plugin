// Live Preview's Properties widget, reached through the markup themes style it by: a row is
// `.metadata-property[data-property-key]`, and its value sits in `.metadata-property-value`.
// This is markup and not API, which offers nothing here; if it changes, focusing stops and
// nothing else does.
import { MarkdownView, Notice } from "obsidian";
import type { TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { ID_REFUSED, propertiesWrite, tellLocked } from "./headingmarks.ts";
import { isEntityText } from "./headings.ts";
import { idOf, isCopyPress, lostId, lostInProperties } from "./idlock.ts";
import type { Press } from "./idlock.ts";

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
// - In a note, the widget calls `MarkdownView.saveFrontmatter` with the frontmatter it would
//   save, in every view. In Live Preview and Source mode that rewrites the text and hands it to
//   the editor, which dispatches the difference with the event `set`, the event of a file
//   reloaded from disk, then saves. In Reading view no editor sees it: the text goes to the
//   renderer and is saved from there. So the write is decided before it is made, from the
//   frontmatter it would save, and a refused one is never made; the widget, which already shows
//   what was typed, is drawn again from the note. The flag the filter reads while the write runs
//   stays as a second layer.
// - The core Properties pane in the sidebar writes the file itself, through `vault.process`, and
//   the note's editor then takes the change as a reload, which must pass. So there the write is
//   held before it reaches the file, and the pane is drawn again from the file.
//
// An embed's or a canvas node's own editor has a `saveFrontmatter` of its own, which is not held.
// Where any of this changes, the note's own filter still holds Source mode and the checks still
// run; the widget and the pane stop being held.
const LOCKED_VALUE = '[data-companygraph-id="locked"] .metadata-property[data-property-key="id"] .metadata-property-value';

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
export function isEntityFile(plugin: CompanyGraphPlugin, path: string, text: string): boolean {
  const layout = plugin.layout;
  if (!layout || !path.startsWith(`${layout.model}/`)) return false;
  const type = typeOfPath(path, layout.model);
  return !!type && plugin.vocabulary.has(type) && isEntityText(text);
}

// The widget skips a frontmatter it believes it shows; forgetting it makes it draw the note's.
interface Redrawn { rawFrontmatter?: string | null }

interface PaneView extends Redrawn {
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
        tellLocked(ID_REFUSED);
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

// Puts a page's id on the clipboard, and says so either way: a press that shows nothing reads as
// a copy that worked.
export function copyId(id: string) {
  void navigator.clipboard.writeText(id)
    .then(() => new Notice(`CompanyGraph: id copied (${id})`))
    .catch((error: unknown) => new Notice(`CompanyGraph: the id could not be copied (${error instanceof Error ? error.message : String(error)})`));
}

// The id of the page a note shows, or null where it has none or a blank one.
export function idIn(view: MarkdownView): string | null {
  return idOf(view.getViewData()) || null;
}

function viewHolding(plugin: CompanyGraphPlugin, el: Element): MarkdownView | null {
  let found: MarkdownView | null = null;
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(el)) found = leaf.view;
  });
  return found;
}

// Everything the focus can land on, in the order Tab moves through it.
const FOCUSABLE = 'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

// Where the focus goes instead of the locked value: on past it the way it came, forward from
// before it and back from after it, to the next thing that can hold it and is drawn.
function passFocus(target: HTMLElement, from: EventTarget | null) {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => el.offsetParent !== null && !el.closest(LOCKED_VALUE) && !el.contains(target));
  const back = from instanceof Node && !!(target.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING);
  const next = back
    ? [...all].reverse().find((el) => !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING))
    : all.find((el) => !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING));
  target.blur();
  next?.focus();
}

export function holdIdInProperties(plugin: CompanyGraphPlugin) {
  wrapSave(plugin, MarkdownView.prototype, (original) => function (this: unknown, frontmatter: unknown) {
    const view = this instanceof MarkdownView ? this : null;
    const redraw = () => {
      const note = view as unknown as Redrawn & { loadFrontmatter?: (text: string) => void };
      note.rawFrontmatter = null;
      note.loadFrontmatter?.(view!.getViewData());
    };
    if (view?.file) {
      const text = view.getViewData();
      if (isEntityFile(plugin, view.file.path, text) && lostInProperties(idOf(text), frontmatter)) {
        tellLocked(ID_REFUSED);
        redraw();
        return;
      }
    }
    propertiesWrite.active = true;
    propertiesWrite.refused = false;
    try {
      original.call(this, frontmatter);
    } finally {
      propertiesWrite.active = false;
      if (propertiesWrite.refused && view) {
        propertiesWrite.refused = false;
        redraw();
      }
    }
  });
  plugin.app.workspace.onLayoutReady(() => holdPane(plugin));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", () => holdPane(plugin)));

  // A press on the locked value, its lock included, copies the id and takes no focus: copying is
  // what a person wants of an id they cannot edit, and a value that turns the focus away cannot
  // be selected. The container carries the attribute; headingmarks.ts sets it.
  const locked = (target: EventTarget | null) =>
    target instanceof HTMLElement ? target.closest<HTMLElement>(LOCKED_VALUE) : null;
  // The press is read from the button going down to the click: the primary button only, and not
  // where the pointer moved, so a drag copies nothing. Every press still takes no focus.
  let down: Press | null = null;
  const pressOf = (event: MouseEvent): Press => ({ button: event.button, x: event.clientX, y: event.clientY });
  plugin.registerDomEvent(document, "mousedown", (event) => {
    const value = locked(event.target);
    down = value ? pressOf(event) : null;
    if (!value) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
  plugin.registerDomEvent(document, "click", (event) => {
    const value = locked(event.target);
    if (!value) return;
    event.preventDefault();
    event.stopPropagation();
    const copy = isCopyPress(down, pressOf(event));
    down = null;
    if (!copy) return;
    const view = viewHolding(plugin, value);
    const id = view ? idIn(view) : null;
    if (id) copyId(id);
  }, { capture: true });
  // The focus that still reaches it, by Tab, is passed on and says why.
  plugin.registerDomEvent(document, "focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !locked(target)) return;
    passFocus(target, event.relatedTarget);
    tellLocked(ID_REFUSED);
  }, { capture: true });
}
