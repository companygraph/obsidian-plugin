// Which spans of a file are names a schema declares as references, and what each names. Pure:
// lines and the file's type's vocabulary in, spans out; where they are on the screen is the
// Obsidian-facing modules' business. A qualifier counts as much as a reference, since both name
// an entity; what differs is only whether the model draws an edge, which is links.ts's concern.
import { tableOf } from "companygraph-meta-model/checks";
import { frontmatterEnd } from "./context.ts";
import type { TypeVocabulary } from "./vocabulary.ts";
import { visibleIn } from "./scope.ts";
import type { Named } from "./scope.ts";

export interface Reference {
  line: number;   // zero-based
  from: number;   // the name's first character on that line
  to: number;     // one past its last
  name: string;
  target: string; // the type the declaration names
}

const targetOf = (offer: TypeVocabulary["fields"][number]["offer"]) => (offer.kind === "names" ? offer.target : null);

// The span of a value as written, with surrounding quotes and spaces left out of it.
function span(line: number, text: string, start: number, target: string): Reference | null {
  let from = start, to = text.length;
  while (from < to && /\s/.test(text[from])) from++;
  while (to > from && /\s/.test(text[to - 1])) to--;
  if (to - from >= 2 && /^["']$/.test(text[from]) && text[to - 1] === text[from]) { from++; to--; }
  return to > from ? { line, from, to, name: text.slice(from, to), target } : null;
}

// The cells of a table row as spans, split on pipes a backslash does not escape.
function cells(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = text.indexOf("|");
  if (start < 0) return out;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === "|") { out.push({ from: start + 1, to: i }); start = i; }
  }
  return out;
}

export function referencesIn(lines: string[], vocabulary: TypeVocabulary): Reference[] {
  const out: Reference[] = [];
  const end = frontmatterEnd(lines);
  const field = (name: string) => vocabulary.fields.find((f) => f.name === name);

  for (let line = 1; line < end; line++) {
    const text = lines[line];
    const item = text.match(/^(\s*-\s+)/);
    if (item) {
      let up = line - 1;
      while (up > 0 && /^\s*-\s/.test(lines[up])) up--;
      const key = lines[up].match(/^([\w-]+):\s*$/)?.[1];
      const f = key ? field(key) : undefined;
      const target = f?.list ? targetOf(f.offer) : null;
      const ref = target ? span(line, text, item[1].length, target) : null;
      if (ref) out.push(ref);
      continue;
    }
    const value = text.match(/^([\w-]+):/);
    const f = value ? field(value[1]) : undefined;
    const target = f && !f.list ? targetOf(f.offer) : null;
    const ref = target ? span(line, text, value![0].length, target) : null;
    if (ref) out.push(ref);
  }

  let section: string | null = null;
  for (let line = Math.max(end + 1, 0); line < lines.length; line++) {
    const text = lines[line];
    if (text.startsWith("## ")) { section = text.slice(3).trim(); continue; }
    if (!text.trimStart().startsWith("|")) continue;
    let last = line;
    while (last + 1 < lines.length && lines[last + 1].trimStart().startsWith("|")) last++;
    const columns = vocabulary.sections.find((s) => s.heading === section)?.columns;
    // The header is read by the package's table reader, as the checks read it; a block it does
    // not read as a table holds no references.
    const header = columns ? tableOf(lines.slice(line, last + 1).join("\n"))?.columns : undefined;
    if (columns && header)
      for (let row = line + 2; row <= last; row++)
        cells(lines[row]).forEach((cell, i) => {
          const column = columns.find((c) => c.name === header[i]);
          const target = column ? targetOf(column.offer) : null;
          const ref = target ? span(row, lines[row].slice(0, cell.to), cell.from, target) : null;
          if (ref) out.push(ref);
        });
    line = last;
  }
  return out;
}

// The file of the entity a name names, from the file at `path`, as the checks resolve it: by
// the declared type, and for an owned type within the owner the file is in. null: it names none.
export function resolveIn(named: Named[], path: string, model: string, target: string, name: string): string | null {
  return visibleIn(named, path, model).find((n) => n.type === target && n.name === name)?.path ?? null;
}
