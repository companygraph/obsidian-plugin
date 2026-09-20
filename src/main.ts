// The wiring: when to rebuild, and the three places a rebuild shows — the pane, the open file's
// lines and the status bar. Everything that decides anything is in the pure modules.
import { Keymap, MarkdownView, Notice, Plugin, TFile, debounce, editorInfoField } from "obsidian";
import type { Menu } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { Debouncer } from "obsidian";
import { EditorView as EditorViewClass } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { guard } from "./manifest.ts";
import { buildModel } from "./model.ts";
import { namedOf } from "./scope.ts";
import { linksOf, merge, mergePath, rename } from "./links.ts";
import type { Added, Links } from "./links.ts";
import { markNames, nameLinks, namedPath, refreshNames } from "./namelinks.ts";
import type { Named } from "./scope.ts";
import type { Layout } from "./model.ts";
import { locate } from "./locate.ts";
import type { Located } from "./locate.ts";
import { vocabularyOf } from "./vocabulary.ts";
import type { TypeVocabulary } from "./vocabulary.ts";
import { concerns, loadManifest, readInstance } from "./vault.ts";
import { Pane, VIEW_TYPE } from "./pane.ts";
import { REFERENCES_VIEW, RefsPane, openMention, renderReferences } from "./refspane.ts";
import { referencesFor } from "./refs.ts";
import type { References } from "./refs.ts";
import { CompanyGraphSettingTab } from "./settings.ts";
import { forgotPanes, settingsOf } from "./stored.ts";
import { onRebuild, onRepair, onRestore } from "./panes.ts";
import type { Decision } from "./panes.ts";
import type { Settings } from "./stored.ts";
import { Suggest } from "./suggest.ts";
import { marksField, setMarks } from "./marks.ts";
import { fieldOfLine, propertyRules } from "./properties.ts";
import { cellEditorOf, editingCell, openCell, tintRows } from "./livetable.ts";
import { typeOfPath } from "companygraph-meta-model/checks";
import { absentFields } from "./candidates.ts";
import { AddField } from "./addfield.ts";
import { BRIEF_VIEW, BriefPane } from "./briefpane.ts";
import { headingLock, headingMarks, removeSection } from "./headingmarks.ts";
import { AddSection } from "./addsection.ts";
import { addableSections } from "./headings.ts";
import { PickType } from "./newentity.ts";
import { targetsFor } from "./scaffold.ts";
import { DeleteEntity, RenameEntity } from "./entitycommands.ts";
import { PIN, RULES, RULE_PATHS, changesOf, columnAfter, excludesOf, formOf, formed, inForm } from "./form.ts";

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

// Obsidian's own panes this plugin stands in for. Its backlinks and outgoing links list the
// Markdown links a file holds, and an instance writes none; its properties plugin lists every
// property name in the vault, which no entity is held to, and a note's own fields are the ones
// its schema declares, shown in the note's own widget and offered by the field picker; its tag
// pane lists a vocabulary an instance has none of, since what classifies an entity here is
// another entity, with a file, a schema and a source, and a frontmatter field a schema does not
// declare is a failure (R15). Read and switched through `internalPlugins`, not public API.
const CORE_PANES = ["backlink", "outgoing-link", "properties", "tag-pane"] as const;
type InternalPane = { enabled?: boolean; enable(): unknown; disable(): unknown };

export default class CompanyGraphPlugin extends Plugin {
  state: State = CHECKING;
  layout: Layout | null = null;
  vocabulary = new Map<string, TypeVocabulary>();
  // The release of the checks this build bundles, for the pane to say.
  checker = __CHECKER_VERSION__;
  // The vendored schemas' text by file name, for the writing brief.
  schemas = new Map<string, string>();
  // The entities of the last rebuild that parsed; completion asks which of them a file may name.
  named: Named[] = [];
  // The model's edges as links between files, and what of them was added to Obsidian's map.
  links: Links = {};
  added: Added = new Map();
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
  // The note open last, written back into the family's Markdown form when another is opened.
  left: TFile | null = null;
  // The last rebuild's files, for references.ts's world; an open editor's own text is read fresh
  // through `textOf`, since it may hold an edit the last rebuild has not seen yet.
  files: Map<string, string> = new Map();
  // Built rather than taken from DEFAULT_SETTINGS, whose list of panes is one array: assigned, it
  // would be the array this plugin pushes pane names into, shared by every instance of the class.
  settings: Settings = settingsOf(null);
  // Set at load in a vault whose stored settings are from a release that switched Obsidian's own
  // panes off without remembering which; cleared by the first sync that acts on it.
  repairPanes = false;

  async onload() {
    this.statusBar = this.addStatusBarItem();
    this.rowStyle = document.head.createEl("style");
    this.register(() => this.rowStyle?.remove());
    // Nothing but a command opened the pane, which is the one place a failure can be read.
    this.statusBar.addClass("mod-clickable");
    // Nothing on a status bar item says it can be pressed; the first person to use this read the
    // count and never found the pane. Obsidian shows an aria-label as the tooltip.
    this.statusBar.setAttr("aria-label", "Click to open the compliance pane");
    this.statusBar.setAttr("aria-label-position", "top");
    this.statusBar.onClickEvent(() => void this.openPane());
    this.registerView(VIEW_TYPE, (leaf) => new Pane(leaf, this));
    this.registerView(BRIEF_VIEW, (leaf) => new BriefPane(leaf, this));
    this.registerView(REFERENCES_VIEW, (leaf) => new RefsPane(leaf, this));
    this.watchMenus();
    // The brief follows the cursor of the editor that has the focus, a moment after it settles.
    const brief = debounce((view: EditorView) => this.showBrief(view), 150, true);
    const inline = debounce(() => this.paintInlineRefs(), 200, true);
    this.registerEditorExtension(
      EditorViewClass.updateListener.of((update) => {
        // Only the editor that has the focus: a note open in a second pane takes every change
        // made in the first, and would otherwise answer for a cursor nobody is looking at.
        if ((update.selectionSet || update.docChanged || update.focusChanged) && update.view.hasFocus) brief(update.view);
        // A note switched between Live Preview and Source mode is built again, and the section
        // under it goes with the old editor: it is hung again a moment after the editor settles.
        if (update.docChanged || update.viewportChanged || update.geometryChanged) inline();
      }),
    );
    this.register(() => brief.cancel());
    this.register(() => inline.cancel());
    this.registerEditorExtension(marksField);
    this.registerEditorExtension(nameLinks(this));
    this.registerEditorExtension(headingMarks(this));
    this.registerEditorExtension(headingLock(this));
    // Every editor extension is registered before the first await of this method. Obsidian reads
    // them when it builds an editor, and the editors of the notes already open are built before a
    // plugin's own `loadData` comes back: registered after it, the marks, the lock and the names
    // reached no note until its editor was built again, which the owner's trial found as the
    // locks being gone. `updateOptions` asks Obsidian to build every open editor again, which is
    // what a plugin loaded into a running window needs.
    this.app.workspace.updateOptions();
    const stored: unknown = await this.loadData();
    this.settings = settingsOf(stored);
    this.repairPanes = forgotPanes(stored);
    this.addSettingTab(new CompanyGraphSettingTab(this.app, this));
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
    // Cmd+click on macOS, Ctrl+click elsewhere, on a name that resolves opens what it names. Caught
    // at pointerdown, capturing: Obsidian's table widget selects a cell and its pane activates on
    // pointerdown, before any mousedown, and a prevented pointerdown also keeps CodeMirror from
    // placing the cursor. The click that follows is swallowed, and forgotten on the next tick if
    // none comes. A plain click still edits: a name is text, not a link.
    let opened = false;
    this.registerDomEvent(document, "pointerdown", (event) => {
      opened = false;
      if (!Keymap.isModifier(event, "Mod") || event.button !== 0) return;
      const path = namedPath(event.target);
      const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
      if (!(file instanceof TFile)) return;
      event.preventDefault();
      event.stopPropagation();
      opened = true;
      window.setTimeout(() => (opened = false), 500);
      void this.leafOf(event.target).openFile(file);
    }, { capture: true });
    // A prevented pointerdown suppresses the mousedown that follows it, and where one comes all
    // the same its default, focus and a cursor placed at the press, is kept from happening too.
    this.registerDomEvent(document, "mousedown", (event) => {
      if (opened) event.preventDefault();
    }, { capture: true });
    this.registerDomEvent(document, "click", (event) => {
      if (!opened) return;
      opened = false;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true });
    // Obsidian rebuilds one note's entry in its map of links when the note changes and says so
    // with `resolve`; the note's own edges go back into the fresh entry there, so the `resolved`
    // Obsidian sends after it, which the graph redraws on, already carries them.
    this.registerEvent(this.app.metadataCache.on("resolve", (file) => this.relinkPath(file.path)));
    this.wrapAddProperty();
    this.wrapSave();
    // A cell that is clicked into shows what its column may hold at once. Obsidian asks a suggest
    // when the focus moves into a cell but does not let it open unless something was typed, so
    // the popup is asked for here, a moment after the click, when the cell's editor exists. Only
    // on a click: a cell reached with Tab or an arrow key is being passed through, and a list in
    // every such cell would be in the way of the keys that move on.
    this.registerDomEvent(document, "click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest(".cm-table-widget")) return;
      window.setTimeout(() => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const cell = view ? cellEditorOf(view) : null;
        if (view && cell && cell.getValue().trim() === "") suggest.ask(cell, view.file);
      }, 80);
    });
    this.addCommand({
      id: "complete-here",
      name: "Complete here",
      // Inside a table cell in Live Preview the editor to ask is the cell's own: a command is
      // handed the note's, and focusing that one makes Obsidian close the cell.
      editorCallback: (editor, ctx) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        suggest.ask((view && cellEditorOf(view)) ?? editor, ctx.file);
      },
    });
    this.addCommand({
      id: "remove-section",
      name: "Remove section",
      // The section the cursor is in, whole, where the schema declares it optional; the remove
      // button on the heading runs the same. Offered only in a note that is an entity.
      editorCheckCallback: (checking, editor) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const entity = view ? this.entityFields(view) : null;
        const vocabulary = entity ? this.vocabulary.get(entity.type) : undefined;
        const cm = (editor as unknown as { cm?: EditorView }).cm;
        if (!vocabulary || !cm) return false;
        if (!checking) removeSection(cm, vocabulary, editor.getCursor().line);
        return true;
      },
    });
    this.addCommand({
      id: "add-section",
      name: "Add a section",
      // The declared sections this page lacks; offered only in a note that is an entity.
      editorCheckCallback: (checking, editor) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const entity = view ? this.entityFields(view) : null;
        const vocabulary = entity ? this.vocabulary.get(entity.type) : undefined;
        const cm = (editor as unknown as { cm?: EditorView }).cm;
        if (!vocabulary || !cm) return false;
        if (checking) return true;
        if (addableSections(editor.getValue().split("\n"), vocabulary).length === 0)
          new Notice(`This ${entity!.type} has every section its schema declares.`);
        else new AddSection(this.app, cm, vocabulary).open();
        return true;
      },
    });
    this.addCommand({
      id: "new-entity",
      name: "New entity",
      // The types a new entity may be made of from here: an owned type only from inside its owner.
      checkCallback: (checking) => {
        const layout = this.layout;
        if (!layout || this.vocabulary.size === 0) return false;
        if (checking) return true;
        const active = this.app.workspace.getActiveFile()?.path ?? null;
        const targets = targetsFor(layout.model, active, (path) => this.app.vault.getAbstractFileByPath(path) !== null);
        new PickType(this.app, targets, this.vocabulary, this.named, layout.model).open();
        return true;
      },
    });
    // Rename entity and Delete entity act on the entity the open note is, as the last parse
    // that succeeded knows it; a note the model does not hold, or a model that has not parsed,
    // offers neither.
    const openEntity = () => {
      const path = this.app.workspace.getActiveFile()?.path;
      return path && this.layout ? this.named.find((n) => n.path === path) ?? null : null;
    };
    this.addCommand({
      id: "rename-entity",
      name: "Rename entity",
      checkCallback: (checking) => {
        const target = openEntity();
        if (!target) return false;
        if (!checking) new RenameEntity(this, target).open();
        return true;
      },
    });
    this.addCommand({
      id: "delete-entity",
      name: "Delete entity",
      checkCallback: (checking) => {
        const target = openEntity();
        if (!target) return false;
        if (!checking) new DeleteEntity(this, target).open();
        return true;
      },
    });
    this.addCommand({
      id: "write-form",
      name: "Write this note in the family's Markdown form",
      editorCallback: (_editor, ctx) => { if (ctx.file) void this.writeForm(ctx.file, true); },
    });
    // A note is written back into the family's Markdown form when it is left, not while it is
    // edited: Obsidian's table editor rewrites the whole table on every edit in a cell, and a form
    // written under it would be fought over at every keystroke. Leaving is when the diff would
    // otherwise be kept, and quitting is the last way to leave.
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      const left = this.left;
      this.left = file;
      if (left && left !== file) void this.writeForm(left);
    }));
    this.registerEvent(this.app.workspace.on("quit", (tasks) => {
      const left = this.left;
      if (left) tasks.add(() => this.writeForm(left));
    }));
    this.addCommand({ id: "open-brief", name: "Open the writing brief", callback: () => void this.openBrief() });
    this.addCommand({ id: "open-checks", name: "Open the compliance pane", callback: () => void this.openPane() });
    this.addCommand({ id: "check-now", name: "Check compliance now", callback: () => void this.rebuild() });
    this.addCommand({ id: "open-references", name: "Open the references pane", callback: () => void this.openReferencesPane() });
    this.addCommand({
      id: "toggle-inline-references",
      name: "Toggle references in document",
      callback: () => void this.toggleInlineReferences(),
    });
    // The editor's own more-options menu, so the toggle sits beside the note it acts on. Offered
    // only from that menu, not from the file explorer's context menu, which sends other sources.
    this.registerEvent(this.app.workspace.on("file-menu", (menu, _file, source) => {
      if (source !== "pane-more-options" && source !== "more-options") return;
      menu.addItem((item) =>
        item
          .setTitle("References in document")
          .setChecked(this.settings.referencesInDocument)
          .onClick(() => void this.toggleInlineReferences()),
      );
      // Obsidian's own Add file property, taken out the moment the menu is shown. Not while it is
      // built: a handler registered after this one may add the item afterwards, which is what the
      // owner kept seeing. And not from the page: with native menus the menu never becomes
      // elements at all. Every way of showing a menu is wrapped on the menu this plugin is
      // handed, so the list is swept last, whoever filled it.
      if (this.settings.replaceObsidianPanes && this.layout) this.sweepWhenShown(menu);
    }));

    // Once typing pauses. The path is tested before the debounce, not inside it: a debounced
    // call keeps only its last arguments, and the last file touched may not be the one that mattered.
    this.soon = debounce(() => void this.rebuild(), 400, true);
    const changed = (path: string) => { if (this.layout && concerns(path, this.layout)) this.soon?.(); };
    this.registerEvent(this.app.workspace.on("file-open", () => this.paint()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.refreshBrief();
      this.refreshReferences();
    }));
    // A table widget is drawn a moment after its note opens, and CodeMirror draws only what is in
    // view, so a table scrolled into sight is a new one: the rows are tinted again when the
    // layout settles and, once it pauses, on a scroll. Only the rows: a scroll should not send a
    // transaction to every open note.
    const repaint = debounce(() => this.tintTables(), 300, true);
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      repaint();
      // A note switched between reading and editing is drawn again in the other sizer, so the
      // section under it is hung there again.
      this.paintInlineRefs();
    }));
    this.registerDomEvent(document, "scroll", () => repaint(), { capture: true, passive: true });
    this.register(() => repaint.cancel());
    // A tinted row keeps its tooltip after the stylesheet is gone, so the rows are swept on unload.
    this.register(() => {
      this.state = { ...this.state, located: [] };
      this.tintTables();
    });
    // The vault fires a create event for every file already there when it opens, so these are
    // registered only once the workspace is ready, as the API's own note on `create` asks.
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      this.registerEvent(this.app.vault.on("modify", (file) => changed(file.path)));
      this.registerEvent(this.app.vault.on("create", (file) => changed(file.path)));
      this.registerEvent(this.app.vault.on("delete", (file) => changed(file.path)));
      this.registerEvent(this.app.vault.on("rename", (file, old) => {
        // Obsidian moves the renamed note's entry in its map of links to the new path; what the
        // model added to it, and the model's links from and to it, move with it before anything
        // else happens, or they would stay behind under a path that no longer exists.
        rename(this.links, this.added, old, file.path);
        changed(file.path);
        changed(old);
      }));
      void this.rebuild();
    });
    // The initial state is painted once, or the status bar stays empty until the first check lands.
    this.show(CHECKING);
  }

  onunload() {
    this.unloaded = true;
    this.generation++;
    this.soon?.cancel();
    // What the model added to Obsidian's map of links goes with the plugin.
    this.links = {};
    this.relink();
    // Obsidian's own panes go back only when this plugin is switched off or removed, never
    // because the window is reloading. Both end here and nothing in the call tells them apart,
    // but a timer does: a reload tears the window down before it can fire, while a plugin the
    // owner disabled leaves the application running and the restore happens a tick later.
    // Restoring on a reload switched all four panes on again, Obsidian rebuilt their leaves, and
    // the next load switched them off leaving the tabs behind. Nothing is saved from here: on an
    // uninstall a write would recreate the folder Obsidian is removing, and a plugin merely
    // disabled rewrites the list from the panes themselves the next time it loads.
    window.setTimeout(() => this.applyPanes(onRestore(this.settings.suppressedPanes), false), 0);
    this.removeInlineRefs();
  }

  // The model's edges, added to the map Obsidian draws its graph view, local graph and backlink
  // count from, `metadataCache.resolvedLinks`, which is public; see links.ts for what is and is
  // not replaced. The views redraw when the cache says it has resolved, and that event promises
  // every note has been resolved, so it is sent only when the cache is clean: while Obsidian is
  // still resolving it sends the event itself when it is done, and the `resolve` handler has
  // put the edges back by then. Whether the cache is clean is not public, and taken optionally.
  relink() {
    const cache = this.app.metadataCache as typeof this.app.metadataCache & { isCacheClean?: () => boolean };
    if (!cache.resolvedLinks) return;
    this.added = merge(cache.resolvedLinks, this.links, this.added);
    try {
      if (typeof cache.isCacheClean === "function" && !cache.isCacheClean()) return;
    } catch {
      return; // the cache is being torn down; nothing is drawn any more
    }
    cache.trigger("resolved");
  }

  relinkPath(path: string) {
    const resolved = this.app.metadataCache.resolvedLinks;
    if (resolved) mergePath(resolved, this.links, this.added, path);
  }

  // The note in the form the vault's vendored conventions give it; see form.ts. Only in a vault that
  // carries the rule set, and only a note conventions-format reads there. A note still open in a
  // tab is changed through its editor, which saves it as it saves any edit: a write to disk under
  // an open editor would race that editor's own pending save. `loud` is the command's: it says
  // why nothing was written, where leaving a note says nothing.
  async writeForm(file: TFile, loud = false) {
    try {
      const adapter = this.app.vault.adapter;
      let config = null;
      for (const at of RULE_PATHS) {
        if (!(await adapter.exists(at))) continue;
        config = formOf(await adapter.read(at));
        if (config) break;
      }
      if (!config) {
        if (loud) new Notice(`This vault has no Markdown form: ${RULES} is missing or does not parse.`);
        return;
      }
      const excludes = excludesOf((await adapter.exists(PIN)) ? await adapter.read(PIN) : null);
      if (!formed(file.path, excludes)) {
        if (loud) new Notice(`${file.path} is not held to the form here: conventions.json excludes it.`);
        return;
      }
      let holder: MarkdownView | null = null;
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (!holder && leaf.view instanceof MarkdownView && leaf.view.file === file) holder = leaf.view;
      });
      const view = holder as MarkdownView | null;
      const open = view ? view.editor : null;
      if (open) {
        const before = open.getValue();
        const changes = changesOf(before, inForm(before, config));
        if (!changes.length) {
          if (loud) new Notice("This note is already in the family's Markdown form.");
          return;
        }
        // One run of changed lines at a time, so a line the form leaves alone is never replaced,
        // and the cursor put back on its line and column after, the column held to the line's new
        // length: a line the form did change is replaced whole, which would carry a cursor on it
        // to the line's edge. The plugin's own event, so the lock on declared headings lets the
        // form's own spacing through.
        const cm = (open as unknown as { cm?: EditorView }).cm;
        // In Live Preview a cursor in a table stands in the cell's own editor, which goes when
        // the table is drawn anew after its text changes; that cell is opened again after, with
        // the cursor as far into it as it was, since the form changes no cell's words.
        const cell = view ? editingCell(view) : null;
        const cursor = open.getCursor();
        const was = open.getLine(cursor.line);
        if (cm) {
          const tr = cm.state.update({ changes, userEvent: "input.form" });
          cm.dispatch(tr);
          if (cell && view) {
            const first = cm.state.doc.lineAt(tr.changes.mapPos(cell.start)).number - 1;
            const reopen = () => openCell(view, cm, first, cell.row, cell.col, cell.ch);
            window.setTimeout(() => { if (!reopen()) window.setTimeout(reopen, 200); }, 50);
            return;
          }
        } else for (const c of [...changes].reverse()) open.replaceRange(c.insert, open.offsetToPos(c.from), open.offsetToPos(c.to));
        const line = Math.min(cursor.line, open.lineCount() - 1);
        open.setCursor({ line, ch: columnAfter(was, open.getLine(line), cursor.ch) });
        return;
      }
      const text = await this.app.vault.read(file);
      if (inForm(text, config) !== text) await this.app.vault.process(file, (current) => inForm(current, config));
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      new Notice(`${file.path} was not written in the family's Markdown form: ${why}`);
    }
  }

  // The pane the pointer was in, so a name opens where it was clicked; a click outside every pane
  // opens in the active one.
  leafOf(target: EventTarget | null): WorkspaceLeaf {
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!found && target instanceof Node && leaf.view.containerEl.contains(target)) found = leaf;
    });
    return found ?? this.app.workspace.getLeaf(false);
  }

  async rebuild() {
    const generation = ++this.generation;
    let manifest;
    try {
      manifest = await loadManifest(this.app);
    } catch (error) {
      if (generation !== this.generation) return;
      const why = error instanceof Error ? error.message : String(error);
      this.links = {};
      this.relink();
      return this.show({ ...IDLE, status: "refused", notice: `.companygraph/manifest.json does not parse: ${why}` });
    }
    if (generation !== this.generation) return;
    if (!manifest) {
      this.layout = null;
      this.links = {};
      this.files = new Map();
      this.relink();
      return this.show(IDLE);
    }
    this.layout = { core: `${manifest.units}/core`, model: "model" };
    const verdict = guard(manifest, __CHECKER_VERSION__);
    if (verdict.kind === "refuse") {
      this.links = {};
      this.relink();
      return this.show({ ...IDLE, status: "refused", notice: verdict.message });
    }

    // A file can vanish between getFiles() and its read — a sync client, a git checkout or a
    // rename landing mid-debounce is realistic, not exotic — and checkInstance or locate can
    // throw on what that leaves behind. Caught here, so the UI says so instead of an unhandled
    // rejection leaving the pane, the marks and the status bar on a stale, green-looking state.
    try {
      const files = await readInstance(this.app, this.layout);
      if (generation !== this.generation) return;
      this.files = files;
      const model = buildModel(files, this.layout);
      if (generation !== this.generation) return;
      let schemas: string | null = null;
      try {
        this.vocabulary = vocabularyOf(model.schemas);
        this.schemas = model.schemas;
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
      if (model.graph) {
        this.named = namedOf(model.graph);
        this.links = linksOf(model.graph);
        this.relink();
      }
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
    this.statusBar?.setText(
      state.status === "checking" ? "CompanyGraph: checking"
        : state.status === "idle" ? ""
        : state.status === "refused" ? "CompanyGraph: not checked"
        : `CompanyGraph: ${failures === 0 ? "complies" : `${failures} failure${failures === 1 ? "" : "s"}`}${state.pinDiffers ? ", pin differs" : ""}`,
    );
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof Pane) leaf.view.render();
    // `this.layout` is set exactly when this vault is a CompanyGraph instance, refused checks
    // included: guard.ts's refusal is about the checker's own version, not about what the vault is.
    // `this.layout` is null while the vault has not been read yet as well as when it is no
    // instance, and this method runs once in the first state before anything is known. So a
    // rebuild only ever switches a pane off; giving one back is a deliberate act, the setting
    // switched off or this plugin removed, and panes.ts holds that rule.
    const standIn = this.settings.replaceObsidianPanes && this.layout !== null;
    // The repair waits for this moment rather than running at load, because only here is it known
    // whether this plugin would have been the one to switch those panes off: a vault it never
    // stood in for keeps whatever the owner set, and nothing of theirs is adopted.
    if (this.repairPanes && standIn) {
      this.repairPanes = false;
      this.applyPanes(onRepair(CORE_PANES, (id) => this.paneIsOn(id), this.settings.suppressedPanes));
    }
    this.applyPanes(onRebuild(CORE_PANES, standIn, (id) => this.paneIsOn(id), this.settings.suppressedPanes));
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
  // Saving writes the form too. Cmd+S, Ctrl+S elsewhere, is Obsidian's own command Save current
  // file, read from the installed application as "editor:save-file" with a checkCallback that
  // saves the active view. An explicit save is someone saying the note is done, where the saves
  // Obsidian makes on its own while typing are not, so only the command writes the form; the
  // form goes in through the editor first and Obsidian's save then writes what it holds. Every
  // step is optional, as for Add file property, and the original is put back on unload.
  wrapSave() {
    type Native = { checkCallback?: (checking: boolean) => boolean | void };
    const registry = (this.app as unknown as { commands?: { commands?: Record<string, Native> } }).commands?.commands;
    const native = registry?.["editor:save-file"];
    const original = native?.checkCallback;
    if (!native || typeof original !== "function") return;
    native.checkCallback = (checking: boolean) => {
      const file = checking ? null : this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
      if (!file) return original.call(native, checking);
      void this.writeForm(file).finally(() => original.call(native, false));
      return true;
    };
    this.register(() => { native.checkCallback = original; });
  }

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
      view?.dispatch({ effects: [setMarks.of(marks), refreshNames.of(null)] });

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
    this.tintTables();
    // A rebuild may have brought the schemas the brief had to wait for.
    this.refreshBrief();
    this.refreshReferences();
    this.paintInlineRefs();
  }

  // The rows of Live Preview's table widgets, for every open note; see livetable.ts.
  tintTables() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
      const path = leaf.view.file.path;
      const marks = this.state.located
        .filter((found) => found.path === path)
        .map((found) => ({ line: found.line, message: found.message }));
      const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
      tintRows(leaf.view, cm, marks);
      markNames(this, leaf.view, cm);
    });
  }

  // The brief for the cursor of an editor, if the pane is open. A table cell in Live Preview is
  // edited in a small editor of its own, whose text is the cell's alone; the note it belongs to
  // is the editor around the table, and its cursor sits on the table, in the right section.
  showBrief(view: EditorView) {
    const pane = this.app.workspace.getLeavesOfType(BRIEF_VIEW)[0]?.view;
    if (!(pane instanceof BriefPane)) return;
    const outer = view.dom.closest(".cm-table-widget")?.closest(".cm-editor");
    const note = (outer instanceof HTMLElement ? EditorViewClass.findFromDOM(outer) : null) ?? view;
    const path = note.state.field(editorInfoField, false)?.file?.path ?? null;
    const line = note.state.doc.lineAt(note.state.selection.main.head).number - 1;
    pane.show(path, note.state.doc.toString().split("\n"), line);
  }

  // The brief for the note in front, when something other than its cursor has changed: the pane
  // opened, the model rebuilt, another note came forward.
  refreshBrief() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = (view?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
    if (cm) this.showBrief(cm);
  }

  async openBrief() {
    const open = this.app.workspace.getLeavesOfType(BRIEF_VIEW)[0];
    const leaf = open ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!open) await leaf.setViewState({ type: BRIEF_VIEW, active: false });
    await this.app.workspace.revealLeaf(leaf);
    this.refreshBrief();
  }

  async openPane() {
    const open = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = open ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!open) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openReferencesPane() {
    const open = this.app.workspace.getLeavesOfType(REFERENCES_VIEW)[0];
    const leaf = open ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!open) await leaf.setViewState({ type: REFERENCES_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.refreshReferences();
  }

  // The text of the file at `path` as it stands now: an open editor's, since it may hold an edit
  // the last rebuild has not read yet, or `this.files`, the last rebuild's own map, otherwise.
  textOf(path: string): string | null {
    let text: string | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (text === null && leaf.view instanceof MarkdownView && leaf.view.file?.path === path) text = leaf.view.editor.getValue();
    });
    return text ?? this.files.get(path) ?? null;
  }

  // The two lists for the entity the file at `path` is, or null when there is none, the vault is
  // no instance, or the file is no entity of a type whose schema was read — every case the pane
  // and the section under a note both read as "put the cursor in an entity's note." The world is
  // `this.files`, except for `path` itself, read fresh through `textOf`.
  referencesAt(path: string | null): References | null {
    const layout = this.layout;
    if (!layout || !path || !path.startsWith(`${layout.model}/`)) return null;
    const type = typeOfPath(path, layout.model);
    if (!type || !this.vocabulary.has(type)) return null;
    const text = this.textOf(path);
    const files = text === null ? this.files : new Map(this.files).set(path, text);
    return referencesFor({ files, vocabulary: this.vocabulary, named: this.named, model: layout.model }, path);
  }

  // The references pane, for the note in front, refreshed exactly when the brief is: the pane
  // opened, the model rebuilt, another note came forward.
  refreshReferences() {
    // Not while the references pane itself is what became active: a press inside it would redraw
    // the entry under the pointer between the press and its release, and the click would land on
    // an element that no longer exists, which the owner's trial found as needing two clicks.
    if (this.app.workspace.getActiveViewOfType(RefsPane)) return;
    // The file in front, not the view with the focus: a click inside the references pane makes
    // the pane itself the active view, and asking for the active Markdown view would answer
    // nothing and leave the pane on its idle line the moment it is used.
    const path = this.app.workspace.getActiveFile()?.path ?? null;
    const refs = this.referencesAt(path);
    for (const leaf of this.app.workspace.getLeavesOfType(REFERENCES_VIEW))
      if (leaf.view instanceof RefsPane) leaf.view.render(path, refs);
  }

  // The section under every open note: drawn where the setting is on and the note is an entity,
  // removed otherwise, so it never survives the setting going off or a note that stops being one.
  // What the section under a note last said, per the element it hangs in: drawn again only where
  // that changed, since the editor asks for this as it settles and a redraw under the pointer
  // would swallow a press, as the references pane's own redraw once did.
  inlineSaid = new WeakMap<HTMLElement, string>();

  paintInlineRefs() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
      const view = leaf.view;
      const path = view.file?.path;
      if (!path) return;
      // Where a section under the note belongs, read from the installed application: Obsidian
      // hangs its own in-document backlinks inside what scrolls with the note, the editor's sizer
      // while it is edited and the preview's while it is read. Put in the view's outer element,
      // as this was, a section is there and never in sight, which the owner's trial found.
      const host = view.containerEl.querySelector<HTMLElement>(
        view.getMode() === "preview" ? ".markdown-preview-sizer" : ".cm-sizer",
      );
      // A mode switch builds the other sizer, so a section left in the old one goes.
      for (const stray of Array.from(view.containerEl.querySelectorAll<HTMLElement>(".companygraph-inline-refs")))
        if (stray.parentElement !== host) stray.remove();
      const refs = this.settings.referencesInDocument && host ? this.referencesAt(path) : null;
      // A note is padded at the bottom by half the window, so it can be scrolled past its end,
      // and Obsidian shrinks that padding to a hundred pixels for its own in-document backlinks;
      // read from the installed application. Without the same, the section under a note stands
      // that half window below the text it belongs to, which the owner saw as a huge gap.
      const content = (view.editor as unknown as { cm?: EditorView }).cm?.contentDOM;
      if (content) content.style.paddingBottom = refs ? "100px" : "";
      const existing = host?.querySelector<HTMLElement>(":scope > .companygraph-inline-refs") ?? null;
      if (!refs || !host) { existing?.remove(); return; }
      const section = existing ?? host.createDiv({ cls: "companygraph-inline-refs" });
      const said = JSON.stringify([path, refs]);
      if (existing && this.inlineSaid.get(section) === said) return;
      this.inlineSaid.set(section, said);
      renderReferences(section, refs, (where, line) => void openMention(this.app, where, line));
    });
  }

  removeInlineRefs() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) leaf.view.contentEl.querySelector(".companygraph-inline-refs")?.remove();
    });
  }

  async toggleInlineReferences() {
    this.settings.referencesInDocument = !this.settings.referencesInDocument;
    await this.saveSettings();
    this.paintInlineRefs();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Obsidian's own backlink and outgoing-link panes, switched off while this plugin stands in for
  // them and back on for whatever this plugin itself switched off. Not public API, so every step
  // is optional, and only a pane confirmed on (`enabled === true`) before is tracked to restore:
  // one this plugin cannot confirm is left exactly as it was found.
  // Obsidian's Add file property, taken out of every menu that opens with it. It offers every
  // property name the vault has ever seen, and an entity's fields are the ones its schema
  // declares, which the note's own widget and the field picker answer. Two menus carry it, the
  // editor's more-options menu and the Properties heading's own, and the second is built by
  // Obsidian with no event a plugin can answer, so the menus are watched as they are added to
  // the page instead. The item is found by the name Obsidian gives its own command, so it is the
  // right item in any language, and by the markup a menu is drawn with, which is not API: where
  // either changes the item stays and nothing else does.
  // The name Obsidian gives its own Add file property command, which is the item's title in
  // whatever language the application runs in.
  addPropertyTitle(): string | null {
    const name = (this.app as unknown as { commands?: { commands?: Record<string, { name?: string }> } })
      .commands?.commands?.["markdown:add-metadata-property"]?.name;
    return name?.trim() || null;
  }

  // Every way a menu is shown, wrapped so the item is taken out just before it: showAtPosition,
  // showAtMouseEvent and the show a submenu uses. The wrapping is on the one menu, which Obsidian
  // throws away after it closes, so nothing of the application is left changed.
  sweepWhenShown(menu: Menu) {
    const shows = ["showAtPosition", "showAtMouseEvent", "showAtEntry"] as const;
    const held = menu as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined>;
    for (const name of shows) {
      const original = held[name];
      if (typeof original !== "function") continue;
      held[name] = (...args: unknown[]) => {
        this.dropAddProperty(menu);
        return original.apply(menu, args);
      };
    }
  }

  // The item taken out of a menu object, before Obsidian draws or hands it to the system. Neither
  // the list of items nor an item's own title element is public API, so every step is optional.
  dropAddProperty(menu: Menu) {
    const title = this.addPropertyTitle();
    const items = (menu as unknown as { items?: { titleEl?: HTMLElement; dom?: HTMLElement }[] }).items;
    if (!title || !Array.isArray(items)) return;
    for (let i = items.length - 1; i >= 0; i--) {
      const said = items[i]?.titleEl?.textContent ?? items[i]?.dom?.textContent ?? "";
      if (said.trim() !== title) continue;
      items[i].dom?.remove();
      items.splice(i, 1);
    }
  }

  watchMenus() {
    const observer = new MutationObserver((records) => {
      if (!this.settings.replaceObsidianPanes || !this.layout) return;
      const title = this.addPropertyTitle();
      if (!title) return;
      for (const record of records)
        for (const added of Array.from(record.addedNodes)) {
          if (!(added instanceof HTMLElement) || !added.hasClass("menu")) continue;
          for (const item of Array.from(added.querySelectorAll<HTMLElement>(".menu-item")))
            if ((item.querySelector(".menu-item-title")?.textContent ?? "").trim() === title) item.remove();
        }
    });
    observer.observe(document.body, { childList: true });
    this.register(() => observer.disconnect());
  }

  // Obsidian's internal plugins, or null where this build of Obsidian does not offer them. Not
  // public API, so every caller does without rather than failing.
  internalPanes(): { getPluginById(id: string): InternalPane | null } | null {
    return (this.app as unknown as {
      internalPlugins?: { getPluginById(id: string): InternalPane | null };
    }).internalPlugins ?? null;
  }

  // Whether Obsidian holds one of its own panes on. Not public API, so an answer it cannot give
  // is read as off: a pane this plugin cannot see is one it must not claim to have switched.
  paneIsOn(id: string): boolean {
    try {
      return this.internalPanes()?.getPluginById(id)?.enabled === true;
    } catch {
      return false;
    }
  }

  // A decision from panes.ts carried out, and the list it leaves behind remembered. `save` is
  // false only on the way out, where writing would recreate a folder Obsidian is removing.
  applyPanes(decision: Decision, save = true) {
    const internal = this.internalPanes();
    if (!internal) return;
    for (const [ids, act] of [[decision.disable, "disable"], [decision.enable, "enable"]] as const)
      for (const id of ids) {
        try {
          internal.getPluginById(id)?.[act]();
        } catch {
          // Not public API: a change upstream leaves Obsidian's own panes exactly as they were.
        }
      }
    const was = this.settings.suppressedPanes.join(" ");
    this.settings.suppressedPanes = decision.remembered;
    // Only when it moved: a rebuild runs on every keystroke and a write per keystroke is not a
    // setting.
    if (save && decision.remembered.join(" ") !== was) void this.saveSettings();
  }

  // Obsidian's own panes given back on purpose: the setting switched off. The settings tab calls
  // this, and nothing else does — a rebuild never gives a pane back.
  syncPanes(off: boolean) {
    if (off) this.applyPanes(onRebuild(CORE_PANES, true, (id) => this.paneIsOn(id), this.settings.suppressedPanes));
    else this.applyPanes(onRestore(this.settings.suppressedPanes));
  }
}
