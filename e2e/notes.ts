// What more than one test reads: the fixture's long note, a note brought to the front, the
// mentions of an entity as the plugin finds them, and the cell that holds the focus.
import type { Driver } from "./driver.ts";

// The reference instance's profile: the note with the long tables every defect of §1 needed.
export const PROFILE = "model/profiles/robert-blust/robert-blust.md";

export interface Mention { path: string; line: number; name: string; declared: string }
export interface Cell { text: string; col: number; row: number; rowTexts: string[]; inSight: boolean; ref: boolean; unresolved: boolean; path: string | null; shadow: string; fill: string }

export async function openNote(ui: Driver, note: string) {
  await ui.evaluate(async (at: string) => {
    const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(false);
    await leaf.openFile(app.vault.getAbstractFileByPath(at), { active: true });
    app.workspace.setActiveLeaf(leaf, { focus: true });
  }, [note]);
  await ui.waitFor(`${note} to be in front`, (at: string) => {
    const view = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view;
    return view?.file?.path === at && view.getMode() === "source" && view.editor.getValue().length > 0;
  }, [note]);
}

// Every name written elsewhere that resolves to `target`, in the order the references pane lists them.
export const mentionsOf = (ui: Driver, target: string) =>
  ui.evaluate((at: string) => {
    const out: { path: string; line: number; name: string; declared: string }[] = [];
    for (const group of app.plugins.plugins.companygraph.referencesAt(at)?.in ?? [])
      for (const m of group.mentions) out.push({ path: m.path, line: m.line, name: m.name, declared: m.declared });
    return out;
  }, [target]) as Promise<Mention[]>;

// The tables of a note as runs of lines that open with a pipe: first line, last line, header cells.
export function tablesOf(text: string): { first: number; last: number; header: string[] }[] {
  const lines = text.split("\n");
  const out: { first: number; last: number; header: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const first = i;
    while (i + 1 < lines.length && lines[i + 1].startsWith("|")) i++;
    out.push({ first, last: i, header: lines[first].split("|").slice(1, -1).map((c) => c.trim()) });
  }
  return out;
}

export const paddedLines = (text: string) => text.split("\n").filter((line) => line.startsWith("|") && / {2,}\|/.test(line)).length;

// The cell of a drawn table that holds the focus, or null. Runs in the page.
export function focusedCell() {
  const td = document.activeElement?.closest?.(".cm-table-widget td, .cm-table-widget th") as HTMLTableCellElement | null;
  const tr = td?.closest("tr");
  const table = td?.closest("table");
  if (!td || !tr || !table) return null;
  const rect = td.getBoundingClientRect();
  const style = getComputedStyle(td);
  // While a cell is edited it holds its drawn text, hidden, and its own editor: the editor is
  // what a person sees, so that is the cell's text here.
  const shown = td.querySelector(".cm-content") as HTMLElement | null;
  return {
    text: (shown ?? td).innerText.trim(), col: td.cellIndex, row: Array.from(table.rows).indexOf(tr),
    rowTexts: Array.from(tr.cells).map((c) => (c === td ? (shown ?? td).innerText : c.innerText).trim()),
    inSight: rect.top >= 0 && rect.bottom <= innerHeight,
    ref: td.classList.contains("companygraph-ref"), unresolved: td.classList.contains("is-unresolved"),
    path: td.getAttribute("data-companygraph-path"), shadow: style.boxShadow, fill: style.backgroundColor,
  };
}

export const focused = (ui: Driver) => ui.evaluate(focusedCell) as Promise<Cell | null>;

// The text the front note's editor holds. Runs in the page.
export function editorText() {
  return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string;
}
