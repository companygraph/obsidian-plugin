// The wiring: when to rebuild, and the three places a rebuild shows — the pane, the open file's
// lines and the status bar. Everything that decides anything is in the pure modules.
import { MarkdownView, Plugin, debounce } from "obsidian";
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

// The release of companygraph-meta-model this build bundles; esbuild.config.mjs defines it.
declare const __CHECKER_VERSION__: string;

export interface State {
  status: "idle" | "refused" | "checked";
  notice: string | null;
  located: Located[];
  skipped: string[];
}

const IDLE: State = { status: "idle", notice: null, located: [], skipped: [] };

export default class CompanyGraphPlugin extends Plugin {
  state: State = IDLE;
  layout: Layout | null = null;
  vocabulary = new Map<string, TypeVocabulary>();
  names = new Map<string, string[]>();
  statusBar: HTMLElement | null = null;

  async onload() {
    this.statusBar = this.addStatusBarItem();
    this.registerView(VIEW_TYPE, (leaf) => new Pane(leaf, this));
    this.registerEditorExtension(marksField);
    this.registerEditorSuggest(new Suggest(this.app, this));
    this.addCommand({ id: "open-checks", name: "Open the checks pane", callback: () => void this.openPane() });
    this.addCommand({ id: "check-now", name: "Check the instance now", callback: () => void this.rebuild() });

    // Once typing pauses. The path is tested before the debounce, not inside it: a debounced
    // call keeps only its last arguments, and the last file touched may not be the one that mattered.
    const soon = debounce(() => void this.rebuild(), 400, true);
    const changed = (path: string) => { if (this.layout && concerns(path, this.layout)) soon(); };
    this.registerEvent(this.app.vault.on("modify", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, old) => { changed(file.path); changed(old); }));
    this.registerEvent(this.app.workspace.on("file-open", () => this.paint()));
    this.app.workspace.onLayoutReady(() => void this.rebuild());
  }

  async rebuild() {
    let manifest;
    try {
      manifest = await loadManifest(this.app);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return this.show({ ...IDLE, status: "refused", notice: `.companygraph/manifest.json does not parse: ${why}` });
    }
    if (!manifest) {
      this.layout = null;
      return this.show(IDLE);
    }
    this.layout = { core: `${manifest.units}/core`, model: "model" };
    const verdict = guard(manifest, __CHECKER_VERSION__);
    if (verdict.kind === "refuse") return this.show({ ...IDLE, status: "refused", notice: verdict.message });

    const files = await readInstance(this.app, this.layout);
    const model = buildModel(files, this.layout);
    try {
      this.vocabulary = vocabularyOf(model.schemas);
    } catch {
      // A vendored schema off the fixed shape. Core is never edited in an instance, so this is
      // a broken copy; the last vocabulary that read stays, and the manifest's hashes say which file.
    }
    // Names are those of the last rebuild that parsed: a reference is unresolvable exactly
    // while its name is half typed, which is when completion is wanted.
    if (model.graph) this.names = namesByType(model.graph);
    this.show({
      status: "checked",
      notice: verdict.kind === "report" ? verdict.message : null,
      located: model.failures.map((failure) => locate(failure, files)),
      skipped: model.skipped,
    });
  }

  show(state: State) {
    this.state = state;
    const failures = state.located.length;
    const unchecked = state.skipped.length + 1; // the writing rules, always
    this.statusBar?.setText(
      state.status === "idle" ? ""
        : state.status === "refused" ? "CompanyGraph: not checked"
        : `CompanyGraph: ${failures} failure${failures === 1 ? "" : "s"}, ${unchecked} not checked${state.notice ? ", pin differs" : ""}`,
    );
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof Pane) leaf.view.render();
    this.paint();
  }

  paint() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
      const path = leaf.view.file.path;
      const marks = this.state.located
        .filter((found) => found.path === path)
        .map((found) => ({ line: found.line, message: found.message }));
      // @ts-expect-error Obsidian's Editor wraps a CodeMirror 6 view and does not type it.
      const view = leaf.view.editor.cm as EditorView | undefined;
      view?.dispatch({ effects: setMarks.of(marks) });
    });
  }

  async openPane() {
    const open = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = open ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!open) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
