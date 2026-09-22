// Completion inside the Properties widget, for the fields a schema declares. Obsidian's own
// suggestions there are the values the vault's files hold, so they know no schema and lose a
// value the moment the last file drops it; a declared field's input gets a suggest of the
// plugin's instead, through Obsidian's public AbstractInputSuggest, offering what
// propertyCandidates decides. The widget's rows and inputs are found by the markup themes style
// them by, the footing the pill styling already stands on: if it changes, completion stops here
// and nothing else does. Attached once per input, before any focus lands in it. Stopping the
// input event also starves Obsidian's own sanitizer of the contenteditable, which is what
// flattens a pasted line break; for a name, a value or a file name a line break is never wanted,
// so nothing is lost today.
import { AbstractInputSuggest, MarkdownView } from "obsidian";
import { IMAGE_FILE } from "companygraph-meta-model/instance";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { propertyCandidates } from "./candidates.ts";
import { namesIn } from "./scope.ts";
import type { Field } from "./vocabulary.ts";

const attached = new WeakSet<HTMLElement>();

class PropertySuggest extends AbstractInputSuggest<string> {
  readonly plugin: CompanyGraphPlugin;
  readonly field: Field;
  readonly path: string;
  readonly row: HTMLElement;
  readonly input: HTMLElement;
  constructor(plugin: CompanyGraphPlugin, field: Field, path: string, row: HTMLElement, input: HTMLElement) {
    super(plugin.app, input as HTMLDivElement);
    this.plugin = plugin;
    this.field = field;
    this.path = path;
    this.row = row;
    this.input = input;
    // Obsidian's own suggest listens to this same input for the same event, and nothing holds a
    // handle to it. This listener is added later and in the capture phase, so it runs first: it
    // stops the event there and drives this suggest itself, through the method the class runs on
    // an input, read from the installed application. Where that method is not there the event
    // passes and both lists show, a failure left visible rather than made silent. It is
    // registered on the plugin, not the input, so it is removed with everything else the plugin
    // unregisters on unload: a dead instance's own capture listener would otherwise outlive it
    // and starve the next one every time the plugin reloads.
    const own = this as unknown as { onInputChange?: () => void; onInputFocus?: () => void };
    const first = (name: "input" | "focus", run: (() => void) | undefined) => {
      if (typeof run !== "function") return;
      plugin.registerDomEvent(input, name, (event) => { event.stopImmediatePropagation(); run.call(this); }, true);
    };
    first("input", own.onInputChange);
    first("focus", own.onInputFocus);
    // Obsidian's own property suggest binds Tab the same way: with the popup open, Tab commits
    // the selected entry instead of moving the focus on with half-typed text. Read the same way
    // as onInputChange and onInputFocus above, and just as optional.
    this.scope.register([], "Tab", (event) => {
      const suggest = this as unknown as { suggestions?: { useSelectedItem?: (e: KeyboardEvent) => boolean } };
      if (!event.isComposing && suggest.suggestions?.useSelectedItem?.(event)) return false;
    });
    // An open popup is this suggest's own state, on the plugin's schedule: unloading the plugin
    // closes it, the way an event handler still open on a dead instance would not.
    plugin.register(() => this.close());
    // Says on the element that this suggest is on it, for a test to wait on before it types.
    input.dataset.companygraphSuggest = field.name;
  }
  getSuggestions(typed: string): string[] {
    const layout = this.plugin.layout;
    if (!layout) return [];
    const names = namesIn(this.plugin.named, this.path, layout.model);
    // What the list holds already, read off the pills the widget draws now: the row is found
    // from the input each time, since the widget redraws its rows and a row kept from the
    // attaching would be the one before the edit.
    const row = this.input.closest(".metadata-property") ?? this.row;
    const held = Array.from(row.querySelectorAll(".multi-select-pill-content")).map((p) => p.textContent ?? "");
    // Every vault file, filtered on every keystroke, is only ever the answer for an image field;
    // any other kind takes nothing beside the note.
    const folder = this.path.slice(0, this.path.lastIndexOf("/"));
    const beside = this.field.offer.kind === "image"
      ? this.plugin.app.vault.getFiles()
          .filter((f) => f.path.startsWith(folder + "/") && !f.path.slice(folder.length + 1).includes("/") && IMAGE_FILE.test(f.path))
          .map((f) => f.name)
      : [];
    return propertyCandidates(this.field, typed, names, held, beside) ?? [];
  }
  // Obsidian selects the popup's first entry the moment showSuggestions draws it, so Enter on an
  // empty query would write that entry though nothing was ever chosen; the stock widget
  // deselects when the text is empty and this suggest does too, once the list Obsidian just
  // built exists to deselect. showSuggestions is internal and undocumented, so this reaches the
  // base class's own through the prototype rather than `super`, and only where it is there: an
  // Obsidian that lacks it draws through whatever it has instead, and the failure of a missed
  // deselect stays visible rather than made silent.
  showSuggestions(values: string[]) {
    const base = (AbstractInputSuggest.prototype as unknown as { showSuggestions?: (this: PropertySuggest, v: string[]) => void }).showSuggestions;
    if (typeof base === "function") base.call(this, values);
    if (this.getValue().trim() !== "") return;
    const suggest = this as unknown as { suggestions?: { forceSetSelectedItem?: (i: number, e: null) => void } };
    suggest.suggestions?.forceSetSelectedItem?.(-1, null);
  }
  renderSuggestion(value: string, el: HTMLElement) {
    el.setText(value);
  }
  selectSuggestion(value: string) {
    // The widget commits what its input holds on Enter: a pill in a list, the value in a single
    // field. Writing the file directly would fight the widget over the same lines.
    this.setValue(value);
    this.close();
    this.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }
}

// Attaches to every declared field's input in a view's Properties widget that has none yet.
function attachIn(plugin: CompanyGraphPlugin, view: MarkdownView) {
  const path = view.file?.path;
  const layout = plugin.layout;
  if (!path || !layout) return;
  const type = typeOfPath(path, layout.model);
  const vocabulary = type ? plugin.vocabulary.get(type) : undefined;
  if (!vocabulary) return;
  for (const row of Array.from(view.containerEl.querySelectorAll<HTMLElement>(".metadata-property[data-property-key]"))) {
    // Obsidian writes the key lower-cased into the markup.
    const field = vocabulary.fields.find((f) => f.name.toLowerCase() === row.dataset.propertyKey);
    if (!field || field.offer.kind === "none") continue;
    // A double-click on a pill makes Obsidian draw a second, small edit input ahead of the row's
    // main one, focused synchronously with Obsidian's own suggest already on it; the main input,
    // the one this suggest belongs on, is always the row's last `.multi-select-input`.
    const input = field.list
      ? Array.from(row.querySelectorAll<HTMLElement>(".multi-select-input")).pop()
      : row.querySelector<HTMLElement>(".metadata-input-longtext");
    if (!input || attached.has(input)) continue;
    attached.add(input);
    new PropertySuggest(plugin, field, path, row, input);
  }
}

// Every open view's widget, for the paint that follows a rebuild: a row drawn before the rebuild
// read the schema that declares its field was passed over, and nothing redraws it afterwards.
export function attachPropertySuggests(plugin: CompanyGraphPlugin) {
  plugin.app.workspace.iterateAllLeaves((leaf) => { if (leaf.view instanceof MarkdownView) attachIn(plugin, leaf.view); });
}

// The widget is drawn after the plugin's own paint and after the view is announced, and it is
// redrawn on every edit; Obsidian's suggest opens the moment an input takes the focus. So the
// attaching has to be there before any focus, and no moment of the plugin's own is the right
// one: each view is watched from the first time it is seen, and the rows are taken as they are
// added, wherever in the view they appear. A redrawn row's input is a new element the watcher
// takes the same way.
export function watchPropertyInputs(plugin: CompanyGraphPlugin) {
  const watched = new WeakSet<Element>();
  // Anything added inside the widget, or the widget itself: a redraw may replace one input in a
  // row that stays, and that input is what has to be taken. A popout window is a realm of its
  // own, with its own HTMLElement constructor, so a node from it fails `instanceof HTMLElement`
  // though it is one; `nodeType` holds across realms.
  const rowsIn = (records: MutationRecord[]) =>
    records.some((r) => Array.from(r.addedNodes).some((n) => {
      if (n.nodeType !== Node.ELEMENT_NODE) return false;
      const el = n as Element;
      return el.closest(".metadata-container") !== null || el.querySelector(".metadata-container") !== null;
    }));
  const scan = () => plugin.app.workspace.iterateAllLeaves((leaf) => {
    if (!(leaf.view instanceof MarkdownView)) return;
    const view = leaf.view;
    attachIn(plugin, view);
    if (watched.has(view.containerEl)) return;
    watched.add(view.containerEl);
    const observer = new MutationObserver((records) => { if (rowsIn(records)) attachIn(plugin, view); });
    observer.observe(view.containerEl, { childList: true, subtree: true });
    // Disconnected with the plugin, in case it unloads first, and with the view, a Component of
    // its own: a leaf the owner closes is a leaf whose observer has to go with it, or it keeps
    // running over a container no longer in the document and keeps the view it was built for
    // reachable for as long as the plugin runs.
    plugin.register(() => observer.disconnect());
    view.register(() => observer.disconnect());
  });
  plugin.registerEvent(plugin.app.workspace.on("file-open", scan));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", scan));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", scan));
  plugin.app.workspace.onLayoutReady(scan);
}
