// What each `##` heading of a page is, as its schema declares it, and where a missing required
// section belongs. Core 0.31.1: a section marked required is present under its heading exactly as
// the schema writes it, and a page may carry sections of its own, which break nothing. A heading
// is read as the parser reads it, a line that opens with `## `, and the frontmatter is not the
// page's body. Pure; lines are counted from 0, as the editor's are.
import type { TypeVocabulary } from "./vocabulary.ts";

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
// A fence is a line that is exactly three dashes, as the parser reads it.
function bodyStart(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  const end = lines.findIndex((l, i) => i > 0 && l === "---");
  return end === -1 ? lines.length : end + 1;
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

// Each required section the page lacks goes after the last declared section it carries that the
// schema lists before it, which is before the next heading after that one; with none, before the
// first heading, which is after the H1 and its tagline. Either way the end of the page when
// there is no such heading. A required section that a heading of the page's own nearly matches
// is left to that heading's hint, so one mistake is offered one way to mend it.
export function missingOf(lines: string[], vocabulary: TypeVocabulary): Missing[] {
  const found = headingLines(lines);
  const hinted = new Set(headingsOf(lines, vocabulary).map((h) => h.nearMiss).filter(Boolean));
  const order = vocabulary.sections.map((s) => s.heading);
  const out: Missing[] = [];
  for (const [index, section] of vocabulary.sections.entries()) {
    if (!section.required || hinted.has(section.heading) || found.some((h) => h.heading === section.heading)) continue;
    const before = found.filter((h) => {
      const at = order.indexOf(h.heading);
      return at !== -1 && at < index;
    });
    const after = before.length ? before[before.length - 1].line : null;
    const next = found.find((h) => (after === null ? true : h.line > after));
    out.push({ heading: section.heading, before: next ? next.line : lines.length });
  }
  return out;
}

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

// What clicking a missing section writes at `at`, where its line is drawn, and where the cursor
// goes after, counted from `at`. The heading stands on a line of its own after a blank line.
// Before a heading that follows, it leaves a line to write on with a blank line either side of
// it; at the end of the page, the line after it.
export function insertionAt(text: string, at: number, heading: string): { insert: string; cursor: number } {
  const title = `## ${heading}\n`;
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  if (lineStart !== at) return { insert: `\n\n${title}`, cursor: title.length + 2 };
  const previous = at === 0 ? "" : text.slice(text.lastIndexOf("\n", at - 2) + 1, at - 1);
  const gap = at > 0 && previous.trim() !== "" ? "\n" : "";
  if (at >= text.length) return { insert: gap + title, cursor: gap.length + title.length };
  return { insert: `${gap}${title}\n\n\n`, cursor: gap.length + title.length + 1 };
}
