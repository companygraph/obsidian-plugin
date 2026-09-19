// What each `##` heading of a page is, as its schema declares it, and where a missing required
// section belongs. Core 0.31.1: a section marked required is present under its heading exactly as
// the schema writes it, and a page may carry sections of its own, which break nothing. A heading
// is read as the parser reads it, a line that opens with `## `, and the frontmatter is not the
// page's body. Pure; lines are counted from 0, as the editor's are.
import type { SectionDecl, TypeVocabulary } from "./vocabulary.ts";

export type HeadingKind = "required" | "optional" | "own";

export interface Heading {
  line: number;
  heading: string;
  kind: HeadingKind;
  // For a heading of the page's own: the declared heading it nearly matches, if the page lacks it.
  nearMiss?: string;
}

// A required section the page does not carry, and the line its heading belongs before. A line
// equal to the page's length is the end of the page.
export interface Missing { heading: string; before: number }

// The first line of the body: past the frontmatter, if the page opens with one.
// A fence is a line that is exactly three dashes, as the parser reads it, and frontmatter is only
// frontmatter once it closes: a `---` typed at the top of a page is not yet a fence.
function bodyStart(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  const end = lines.findIndex((l, i) => i > 0 && l === "---");
  return end === -1 ? 0 : end + 1;
}

function headingLines(lines: string[]): { line: number; heading: string }[] {
  const out: { line: number; heading: string }[] = [];
  for (let i = bodyStart(lines); i < lines.length; i++)
    if (lines[i].startsWith("## ")) out.push({ line: i, heading: lines[i].slice(3).trim() });
  return out;
}

// Case, spacing and punctuation set aside; a letter outside ASCII is a letter.
const folded = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

// The declared heading a heading of the page's own nearly matches: equal once case, spacing and
// punctuation are set aside, or one edit from it, two for a heading longer than six letters. Two
// edits on a short heading are most of it: a phase's own `## Note` is not a typo of `## Gate`.
// Only a heading the page does not carry already, since a second one is a section of the page's
// own and not a typo of the first.
export function nearMissOf(heading: string, vocabulary: TypeVocabulary, carried: string[]): string | null {
  const mine = folded(heading);
  if (!mine) return null;
  for (const s of vocabulary.sections) {
    if (carried.includes(s.heading)) continue;
    const theirs = folded(s.heading);
    if (mine === theirs || distance(mine, theirs) <= (theirs.length > 6 ? 2 : 1)) return s.heading;
  }
  return null;
}

export function headingsOf(lines: string[], vocabulary: TypeVocabulary): Heading[] {
  const found = headingLines(lines);
  const carried = found.map((h) => h.heading).filter((h) => vocabulary.sections.some((s) => s.heading === h));
  return found.map(({ line, heading }) => {
    const declared = vocabulary.sections.find((s) => s.heading === heading);
    if (declared) return { line, heading, kind: declared.required ? "required" : "optional" };
    const nearMiss = nearMissOf(heading, vocabulary, carried);
    return nearMiss ? { line, heading, kind: "own", nearMiss } : { line, heading, kind: "own" };
  });
}

// Where a declared section belongs on a page: after the last declared section the page carries
// that the schema lists before it, which is before the next heading after that one; with none,
// before the first heading, which is after the H1 and its tagline. Either way the end of the
// page when there is no such heading. The line its heading goes before.
export function placementOf(lines: string[], vocabulary: TypeVocabulary, heading: string): number {
  const found = headingLines(lines);
  const order = vocabulary.sections.map((s) => s.heading);
  const index = order.indexOf(heading);
  const before = found.filter((h) => {
    const at = order.indexOf(h.heading);
    return at !== -1 && at < index;
  });
  const after = before.length ? before[before.length - 1].line : null;
  const next = found.find((h) => (after === null ? true : h.line > after));
  return next ? next.line : lines.length;
}

// Each required section the page lacks, where it belongs. A required section that a heading of the
// page's own nearly matches is left to that heading's hint, so one mistake is offered one way to
// mend it.
export function missingOf(lines: string[], vocabulary: TypeVocabulary): Missing[] {
  const found = headingLines(lines);
  const hinted = new Set(headingsOf(lines, vocabulary).map((h) => h.nearMiss).filter(Boolean));
  return vocabulary.sections
    .filter((s) => s.required && !hinted.has(s.heading) && !found.some((h) => h.heading === s.heading))
    .map((s) => ({ heading: s.heading, before: placementOf(lines, vocabulary, s.heading) }));
}

// The declared sections a page does not carry, in the schema's order: what Add a section offers.
export function addableSections(lines: string[], vocabulary: TypeVocabulary): SectionDecl[] {
  const carried = new Set(headingLines(lines).map((h) => h.heading));
  return vocabulary.sections.filter((s) => !carried.has(s.heading));
}

// What a section whose content is a table starts with: its header and separator, the columns as
// the schema declares them, the separator of plain dashes the checks read.
export const tableStart = (section: SectionDecl): string[] =>
  section.columns?.length
    ? [`| ${section.columns.map((c) => c.name).join(" | ")} |`, `| ${section.columns.map(() => "---").join(" | ")} |`]
    : [];

// The section a line is in: from its heading to the line before the next heading, or to the end
// of the page. `to` is exclusive. Null above the first heading.
export function sectionAt(lines: string[], line: number): { heading: string; from: number; to: number } | null {
  const found = headingLines(lines);
  const own = [...found].reverse().find((h) => h.line <= line);
  if (!own) return null;
  const next = found.find((h) => h.line > own.line);
  return { heading: own.heading, from: own.line, to: next ? next.line : lines.length };
}

// What Remove section may remove at a line: the whole section of a declared optional heading.
// A required section is the schema's to keep, and a section of the page's own is text, edited as
// any text is. `to` is exclusive.
export type Removal =
  | { heading: string; from: number; to: number }
  | { refused: "required" | "own" | "none"; heading?: string };

export function removalAt(lines: string[], line: number, vocabulary: TypeVocabulary): Removal {
  const section = sectionAt(lines, line);
  if (!section) return { refused: "none" };
  const declared = vocabulary.sections.find((s) => s.heading === section.heading);
  if (!declared) return { refused: "own", heading: section.heading };
  if (declared.required) return { refused: "required", heading: section.heading };
  return section;
}

// Whether a text is an entity's page and not a fragment of one: a page has its H1. Obsidian hands
// a table cell's own small editor the same extensions and the same file, and the cell's text,
// which has no heading, would otherwise read as a page missing every required section.
export const isEntityText = (text: string) => /^# \S/m.test(text);

// The characters Remove section replaces, and with what. A section in the middle goes from its
// heading to the next one. The last section goes from the end of the last line of text above it,
// so the page ends in one newline and not in the blank line that stood before the heading.
export type Range = { from: number; to: number; insert: string };

export function removalRange(text: string, line: number, vocabulary: TypeVocabulary): Range | Exclude<Removal, { from: number }> {
  const lines = text.split("\n");
  const removal = removalAt(lines, line, vocabulary);
  if ("refused" in removal) return removal;
  const offset = (n: number) => lines.slice(0, n).reduce((sum, l) => sum + l.length + 1, 0);
  if (removal.to < lines.length) return { from: offset(removal.from), to: offset(removal.to), insert: "" };
  let above = removal.from - 1;
  while (above >= 0 && lines[above].trim() === "") above--;
  if (above < 0) return { from: 0, to: text.length, insert: "" };
  return { from: offset(above) + lines[above].length, to: text.length, insert: "\n" };
}

// What writing a section at `at` puts there, and where the cursor goes after, counted from `at`.
// The heading stands on a line of its own after a blank line, and `body`, a table's header where
// the section is a table, after a blank line of its own. Before a heading that follows, it leaves
// a line to write on and a blank line after it; at the end of the page, the line after it.
export function insertionAt(text: string, at: number, heading: string, body: string[] = []): { insert: string; cursor: number } {
  const title = `## ${heading}\n`;
  const rest = body.length ? `\n${body.join("\n")}\n` : "";
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  if (lineStart !== at) {
    const insert = `\n\n${title}${rest}`;
    return { insert, cursor: insert.length };
  }
  const previous = at === 0 ? "" : text.slice(text.lastIndexOf("\n", at - 2) + 1, at - 1);
  const gap = at > 0 && previous.trim() !== "" ? "\n" : "";
  if (at >= text.length) {
    const insert = gap + title + rest;
    return { insert, cursor: insert.length };
  }
  const opened = body.length ? `\n${body.join("\n")}\n` : "\n";
  return { insert: `${gap}${title}${opened}\n\n`, cursor: gap.length + title.length + opened.length };
}

// The lines the lock holds (spec §8): every heading the schema declares, whose text is the
// schema's. Not the H1: it is the entity's name, and renaming an entity is an edit like any other,
// whose references the checks then name wherever they no longer resolve. A declared heading
// written twice is held once, so a pasted copy can be deleted again. Trailing spaces are no part
// of a line held, since the parser trims them too.
export function lockedLines(lines: string[], vocabulary: TypeVocabulary): string[] {
  const out: string[] = [];
  const declared = new Set(vocabulary.sections.map((s) => s.heading));
  const seen = new Set<string>();
  for (const { line, heading } of headingLines(lines)) {
    if (!declared.has(heading) || seen.has(heading)) continue;
    seen.add(heading);
    out.push(lines[line].trimEnd());
  }
  return out;
}

// Which edits the lock holds, by the event CodeMirror carries with them. Held is everything but
// what must pass: `set`, which is how Obsidian applies a file reloaded after a change on disk, and
// refusing it would leave the editor out of step with the file; undo and redo, which only take
// back what was done; this plugin's own commands, `input.section` and `delete.section`, and its
// writing of a note in the family's Markdown form, `input.form`; and a
// character still being composed by an input method, which is refused only at a cost to the
// screen. Obsidian's own heading commands, Shift+Enter and the Editor API carry no event at all,
// and are held, which is the point of holding by default.
const PASS = ["set", "undo", "redo", "input.section", "delete.section", "input.form", "input.type.compose"];
const matches = (event: string, name: string) => event === name || event.startsWith(`${name}.`);
export const isHeld = (event: string | undefined) => !event || !PASS.some((name) => matches(event, name));


// The first locked line an edit lost: one that the page held before more often than after. Held
// by count and not by place, so a line moved whole is kept, and a heading written twice is held
// twice. Null when every locked line is still there.
export function lostLine(before: string[], after: string[]): string | null {
  const left = new Map<string, number>();
  for (const l of after) left.set(l, (left.get(l) ?? 0) + 1);
  for (const l of before) {
    const n = left.get(l) ?? 0;
    if (n === 0) return l;
    left.set(l, n - 1);
  }
  return null;
}
