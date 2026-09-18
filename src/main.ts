// The wiring: when to rebuild, and the three places a rebuild shows — the pane, the open file's
// lines and the status bar. Everything that decides anything is in the pure modules.
import { MarkdownView, Notice, Plugin, debounce } from "obsidian";
import type { Debouncer } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { guard } from "./manifest.ts";
import { buildModel, namesByType } from "./model.ts";
import type { Layout } from "./model.ts";
import { locate } from "./locate.ts";
import type { Located } from "./locate.ts";
import { vocabularyOf } from "./vocabulary.ts";
import type { TypeVocabulary } from "./vocabulary.ts";
import { concerns, loadManifest, readInstance } from "./vault.ts";
import { Pane, VIEW_TYPE } from "./pane.ts";
import { Suggest } from "./suggest.ts";
import { marksField, setMarks } from "./marks.ts";
import { fieldOfLine, propertyRules } from "./properties.ts";
import { typeOfPath } from "companygraph-meta-model/checks";
import { absentFields } from "./candidates.ts";
import { AddField } from "./addfield.ts";

// The release of companygraph-meta-model this build bundles; esbuild.config.mjs defines it.
declare const __CHECKER_VERSION__: string;

export interface State {
  // "checking" until the first rebuild lands: a pane restored at startup would otherwise say
  // the vault is not an instance before anything has looked.
  status: "checking" | "idle" | "refused" | "checked";
  notice: string | null;
  pinDiffers: boolean; // the notice is the guard's, so the status bar may say which
  located: Located[];
  skipped: string[];
}

const CHECKING: State = { status: "checking", notice: null, pinDiffers: false, located: [], skipped: [] };
const IDLE: State = { ...CHECKING, status: "idle" };

export default class CompanyGraphPlugin extends Plugin {
  state: State = CHECKING;
  layout: Layout | null = null;
  vocabulary = new Map<string, TypeVocabulary>();
  names = new Map<string, string[]>();
  statusBar: HTMLElement | null = null;
  // The rules that tint a failing field's row in Live Preview's Properties widget.
  rowStyle: HTMLStyleElement | null = null;
  // True while a press on Add property is being handed back to Obsidian.
  passing = false;
  soon: Debouncer<[], void> | null = null;
  // Bumped at the start of every rebuild, and once more on unload. A rebuild checks its own
  // number against this field after every await: whichever started last owns the field, so an
  // older rebuild that is still in flight never overwrites what a newer one already showed.
  generation = 0;
  // Set in onunload, read by the layout-ready callback: a plugin disabled between the two would
  // otherwise register four vault listeners and run a rebuild after it had been unloaded.
  unloaded = false;

  async onload() {
    this.statusBar = this.addStatusBarItem();
    this.rowStyle = document.head.createEl("style");
    this.register(() => this.rowStyle?.remove());
    // Nothing but a command opened the pane, which is the one place a failure can be read.
    this.statusBar.addClass("mod-clickable");
    // Nothing on a status bar item says it can be pressed; the first person to use this read the
    // count and never found the pane. Obsidian shows an aria-label as the tooltip.
    this.statusBar.setAttr("aria-label", "Click to open the checks");
    this.statusBar.setAttr("aria-label-position", "top");
    this.statusBar.onClickEvent(() => void this.openPane());
    this.registerView(VIEW_TYPE, (leaf) => new Pane(leaf, this));
    this.registerEditorExtension(marksField);
    const suggest = new Suggest(this.app, this);
    this.registerEditorSuggest(suggest);
    this.addCommand({
      id: "add-field",
      name: "Add a field",
      // Offered only in a note that is an entity of a type whose schema was read.
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const entity = view ? this.entityFields(view) : null;
        if (!view || !entity) return false;
        if (checking) return true;
        if (entity.fields.length === 0) new Notice(`This ${entity.type} has every field its schema declares.`);
        else new AddField(this.app, entity.file, view, entity.fields).open();
        return true;
      },
    });
    // The first thing anyone presses to add a field is the widget's own Add property, which lists
    // every property name in the vault and knows no schema. In a note that is an entity, that
    // press opens the picker instead; the picker's last entry hands back to Obsidian's list. The
    // button is found by the markup themes style it by: if that changes, the press is Obsidian's
    // again and nothing else changes. Capturing, so this runs before the widget's own handler.
    this.registerDomEvent(document, "click", (event) => this.onAddProperty(event), { capture: true });
    this.wrapAddProperty();
    this.addCommand({
      id: "complete-here",
      name: "Complete here",
      editorCallback: (editor, ctx) => suggest.ask(editor, ctx.file),
    });
    this.addCommand({ id: "open-checks", name: "Open the checks pane", callback: () => void this.openPane() });
    this.addCommand({ id: "check-now", name: "Check the instance now", callback: () => void this.rebuild() });

    // Once typing pauses. The path is tested before the debounce, not inside it: a debounced
    // call keeps only its last arguments, and the last file touched may not be the one that mattered.
    this.soon = debounce(() => void this.rebuild(), 400, true);
    const changed = (path: string) => { if (this.layout && concerns(path, this.layout)) this.soon?.(); };
    this.registerEvent(this.app.workspace.on("file-open", () => this.paint()));
    // The vault fires a create event for every file already there when it opens, so these are
    // registered only once the workspace is ready, as the API's own note on `create` asks.
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      this.registerEvent(this.app.vault.on("modify", (file) => changed(file.path)));
      this.registerEvent(this.app.vault.on("create", (file) => changed(file.path)));
      this.registerEvent(this.app.vault.on("delete", (file) => changed(file.path)));
      this.registerEvent(this.app.vault.on("rename", (file, old) => { changed(file.path); changed(old); }));
      void this.rebuild();
    });
    // The initial state is painted once, or the status bar stays empty until the first check lands.
    this.show(CHECKING);
  }

  onunload() {
    this.unloaded = true;
    this.generation++;
    this.soon?.cancel();
  }

  async rebuild() {
    const generation = ++this.generation;
    let manifest;
    try {
      manifest = await loadManifest(this.app);
    } catch (error) {
      if (generation !== this.generation) return;
      const why = error instanceof Error ? error.message : String(error);
      return this.show({ ...IDLE, status: "refused", notice: `.companygraph/manifest.json does not parse: ${why}` });
    }
    if (generation !== this.generation) return;
    if (!manifest) {
      this.layout = null;
      return this.show(IDLE);
    }
    this.layout = { core: `${manifest.units}/core`, model: "model" };
    const verdict = guard(manifest, __CHECKER_VERSION__);
    if (verdict.kind === "refuse") return this.show({ ...IDLE, status: "refused", notice: verdict.message });

    // A file can vanish between getFiles() and its read — a sync client, a git checkout or a
    // rename landing mid-debounce is realistic, not exotic — and checkInstance or locate can
    // throw on what that leaves behind. Caught here, so the UI says so instead of an unhandled
    // rejection leaving the pane, the marks and the status bar on a stale, green-looking state.
    try {
      const files = await readInstance(this.app, this.layout);
      if (generation !== this.generation) return;
      const model = buildModel(files, this.layout);
      if (generation !== this.generation) return;
      let schemas: string | null = null;
      try {
        this.vocabulary = vocabularyOf(model.schemas);
      } catch (error) {
        // A vendored schema off the fixed shape. Core is never edited in an instance, so this is
        // a broken copy; the last vocabulary that read stays, and the manifest's hashes say which
        // file. Swallowed, it left the editor with no completion and no word why.
        const why = error instanceof Error ? error.message : String(error);
        schemas = `The vendored schemas could not be read, so completion is off or stale: ${why}`;
      }
      if (generation !== this.generation) return;
      // Names are those of the last rebuild that parsed: a reference is unresolvable exactly
      // while its name is half typed, which is when completion is wanted.
      if (model.graph) this.names = namesByType(model.graph);
      if (generation !== this.generation) return;
      const report = verdict.kind === "report" ? verdict.message : null;
      this.show({
        status: "checked",
        notice: [report, schemas].filter((n) => n !== null).join(" ") || null,
        pinDiffers: report !== null,
        located: model.failures.map((failure) => locate(failure, files)),
        skipped: model.skipped,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      const why = error instanceof Error ? error.message : String(error);
      this.show({ ...IDLE, status: "refused", notice: `The instance was not checked: ${why}` });
    }
  }

  show(state: State) {
    this.state = state;
    const failures = state.located.length;
    const unchecked = state.skipped.length + 1; // the writing rules, always
    this.statusBar?.setText(
      state.status === "checking" ? "CompanyGraph: checking"
        : state.status === "idle" ? ""
        : state.status === "refused" ? "CompanyGraph: not checked"
        : `CompanyGraph: ${failures} failure${failures === 1 ? "" : "s"}, ${unchecked} not checked${state.pinDiffers ? ", pin differs" : ""}`,
    );
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof Pane) leaf.view.render();
    this.paint();
  }

  // The fields the note in this view may still take, or null when it is no entity of a type
  // whose schema was read.
  entityFields(view: MarkdownView) {
    const file = view.file;
    const layout = this.layout;
    if (!file || !layout || !file.path.startsWith(layout.model + "/")) return null;
    const type = typeOfPath(file.path, layout.model);
    const vocabulary = type ? this.vocabulary.get(type) : undefined;
    if (!type || !vocabulary) return null;
    return { file, type, fields: absentFields(vocabulary, view.editor.getValue().split("\n")) };
  }

  // The same, for the way in that is not the button: Obsidian's own command Add file property,
  // which a hotkey runs and which Obsidian itself runs when `---` is typed at the top of an
  // empty note. Read from the installed application: it is registered as
  // "markdown:add-metadata-property" with a checkCallback. The registry is not in the public
  // types, so every step is optional, and the original is put back when the plugin unloads.
  wrapAddProperty() {
    type Native = { checkCallback?: (checking: boolean) => boolean | void };
    const registry = (this.app as unknown as { commands?: { commands?: Record<string, Native> } }).commands?.commands;
    const native = registry?.["markdown:add-metadata-property"];
    const original = native?.checkCallback;
    if (!native || typeof original !== "function") return;
    native.checkCallback = (checking: boolean) => {
      const view = checking || this.passing ? null : this.app.workspace.getActiveViewOfType(MarkdownView);
      const entity = view ? this.entityFields(view) : null;
      if (!view || !entity) return original.call(native, checking);
      new AddField(this.app, entity.file, view, entity.fields, () => {
        this.passing = true;
        try { original.call(native, false); } finally { this.passing = false; }
      }).open();
      return true;
    };
    this.register(() => { native.checkCallback = original; });
  }

  onAddProperty(event: MouseEvent) {
    if (this.passing) return;
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest<HTMLElement>(".metadata-add-button") : null;
    if (!button) return;
    let view: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(button)) view = leaf.view;
    });
    const found = view as MarkdownView | null;
    const entity = found ? this.entityFields(found) : null;
    if (!found || !entity) return;
    event.preventDefault();
    event.stopPropagation();
    new AddField(this.app, entity.file, found, entity.fields, () => {
      // Obsidian's own list: the same press, let through once.
      this.passing = true;
      try { button.click(); } finally { this.passing = false; }
    }).open();
  }

  paint() {
    const rules: string[] = [];
    let leaves = 0;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
      const path = leaf.view.file.path;
      const marks = this.state.located
        .filter((found) => found.path === path)
        .map((found) => ({ line: found.line, message: found.message }));
      // @ts-expect-error Obsidian's Editor wraps a CodeMirror 6 view and does not type it.
      const view = leaf.view.editor.cm as EditorView | undefined;
      view?.dispatch({ effects: setMarks.of(marks) });

      // Live Preview draws the frontmatter as the Properties widget, where a line mark has no
      // line to sit on, and Live Preview is the view most people never leave. The widget's rows
      // carry their field's name in the markup themes style them by, so the row is tinted by a
      // rule scoped to this leaf. It is markup and not API: if it changes, the tint goes and
      // nothing else does.
      const id = String(++leaves);
      leaf.view.containerEl.setAttribute("data-companygraph-leaf", id);
      const lines = leaf.view.editor.getValue().split("\n");
      const fields = marks.map((mark) => fieldOfLine(lines, mark.line)).filter((f): f is string => f !== null);
      rules.push(propertyRules(id, fields));
    });
    if (this.rowStyle) this.rowStyle.textContent = rules.filter((rule) => rule !== "").join("\n");
  }

  async openPane() {
    const open = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = open ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!open) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
