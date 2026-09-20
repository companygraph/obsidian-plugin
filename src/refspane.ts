// The references pane and the section under a note (spec §8), drawn by the one function both
// share, `renderReferences`, so they say the same thing about the same note. Obsidian's own
// backlinks and outgoing links read a file's Markdown links, and the model has none, so this pane
// is what stands in for them; main.ts switches those two off while it runs, in an instance.
import { ItemView, TFile } from "obsidian";
import type { App, WorkspaceLeaf } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import type { References } from "./refs.ts";
import { viewOf } from "./refsview.ts";
import { draggedOver } from "./dragged.ts";

export const REFERENCES_VIEW = "companygraph-references";

const NO_NOTE = "Put the cursor in an entity's note.";
const NAMED_BY_NOTHING = "Nothing names it yet.";
const NAMES_NOTHING = "It names nothing.";

// A mention's file, opened with the cursor on its line, as pane.ts's openAt opens a failure's.
// No frontmatter or table-cell focus here: a reference is a place to read, not one to correct.
export async function openMention(app: App, path: string, line: number) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, { active: true, eState: { line } });
  app.workspace.setActiveLeaf(leaf, { focus: true });
}

// The two lists, drawn into `el`; shared by the pane and the section under a note, so a change to
// one shape changes both at once.
export function renderReferences(el: HTMLElement, refs: References, open: (path: string, line: number) => void) {
  el.empty();
  const view = viewOf(refs);
  for (const [direction, empty] of [[view.in, NAMED_BY_NOTHING] as const, [view.out, NAMES_NOTHING] as const]) {
    const block = el.createDiv();
    block.createDiv({ cls: "companygraph-refs-title", text: direction.title });
    if (direction.groups.length === 0) {
      block.createDiv({ cls: "companygraph-message", text: empty });
      continue;
    }
    for (const group of direction.groups) {
      const file = block.createDiv({ cls: "companygraph-file" });
      const head = file.createDiv({ cls: "companygraph-file-head" });
      const name = head.createDiv({ cls: "companygraph-file-name" });
      name.createSpan({ text: group.name });
      if (group.folder) name.createSpan({ cls: "companygraph-file-folder", text: group.folder });
      head.createSpan({ cls: "companygraph-count", text: String(group.mentions.length) });
      const list = file.createEl("ul");
      for (const mention of group.mentions) {
        const item = list.createEl("li", { cls: "companygraph-open" });
        item.createSpan({ cls: "companygraph-line", text: mention.line === null ? "·" : String(mention.line) });
        item.createSpan({ cls: "companygraph-message", text: `${mention.name} — ${mention.declared}` });
        item.onClickEvent(() => {
          // A press that ends a drag over this entry's own text was a selection, not a wish to leave.
          if (draggedOver(item, activeWindow.getSelection())) return;
          void open(mention.path, mention.at);
        });
      }
    }
  }
}

export class RefsPane extends ItemView {
  plugin: CompanyGraphPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: CompanyGraphPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return REFERENCES_VIEW; }
  getDisplayText() { return "References"; }
  getIcon() { return "links-going-out"; }

  async onOpen() {
    this.contentEl.addClass("companygraph-pane");
    this.say(NO_NOTE);
  }

  say(text: string) {
    this.contentEl.empty();
    this.contentEl.createDiv({ cls: "companygraph-message", text });
  }

  // `path` and `refs` come from main.ts's `referencesAt`; `refs` is null for no note in front, or
  // one that is no entity of a type whose schema was read — both read as the same idle line.
  render(path: string | null, refs: References | null) {
    if (!path || !refs) return this.say(NO_NOTE);
    renderReferences(this.contentEl, refs, (p, line) => void openMention(this.app, p, line));
  }
}
