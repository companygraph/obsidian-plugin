// Which spans of a file are names a schema declares as references, and what each names: a
// frontmatter value, a table cell of a declared column, a `###` heading of a grouped section. Pure:
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
  optional: boolean; // declared `ref?`: a value that names nothing is a fact, not a broken name
}

type Offer = TypeVocabulary["fields"][number]["offer"];
const targetOf = (offer: Offer) => (offer.kind === "names" ? offer.target : null);
const optionalOf = (offer: Offer) => offer.kind === "names" && offer.optional === true;

// The span of a value as written, with surrounding quotes and spaces left out of it. In
// frontmatter a YAML comment after it is left out as well: a `#` after a space, outside quotes.
// A table cell has no comments, so a name there may hold one.
function span(line: number, text: string, start: number, target: string, optional: boolean, yaml = false): Reference | null {
  let from = start, to = text.length;
  const value = text.slice(start).trimStart();
  if (yaml && !/^["']/.test(value)) {
    const comment = text.slice(start).search(/\s#/);
    if (comment >= 0) to = start + comment;
  }
  while (from < to && /\s/.test(text[from])) from++;
  while (to > from && /\s/.test(text[to - 1])) to--;
  if (to - from >= 2 && /^["']$/.test(text[from]) && text[to - 1] === text[from]) { from++; to--; }
  return to > from ? { line, from, to, name: text.slice(from, to), target, optional } : null;
}

// The cells of a table row as spans, split on every pipe. That is how the package's table reader
// splits a row, `\|` included, and a column here has to be the column the checks read; where to
// put a mark is the plugin's question, what the cell is called is the package's.
function cells(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = text.indexOf("|");
  for (let i = start + 1; start >= 0 && i < text.length; i++)
    if (text[i] === "|") { out.push({ from: start + 1, to: i }); start = i; }
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
      const ref = target ? span(line, text, item[1].length, target, optionalOf(f!.offer), true) : null;
      if (ref) out.push(ref);
      continue;
    }
    const value = text.match(/^([\w-]+):/);
    const f = value ? field(value[1]) : undefined;
    const target = f && !f.list ? targetOf(f.offer) : null;
    const ref = target ? span(line, text, value![0].length, target, optionalOf(f!.offer), true) : null;
    if (ref) out.push(ref);
  }

  let section: string | null = null;
  let fenced = false;
  for (let line = Math.max(end + 1, 0); line < lines.length; line++) {
    const text = lines[line];
    // A fenced block is code: a heading or a table in it is not the note's.
    if (/^\s*(```|~~~)/.test(text)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (text.startsWith("## ")) { section = text.slice(3).trim(); continue; }
    // A `###` heading of a section its schema declares grouped names an entity, as the parser
    // reads it: the line after `### `, trimmed.
    if (text.startsWith("### ")) {
      const grouped = vocabulary.sections.find((s) => s.heading === section)?.grouped;
      const target = grouped ? targetOf(grouped) : null;
      const ref = target ? span(line, text, 4, target, optionalOf(grouped!)) : null;
      if (ref) out.push(ref);
      continue;
    }
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
          const ref = target ? span(row, lines[row].slice(0, cell.to), cell.from, target, optionalOf(column!.offer)) : null;
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
