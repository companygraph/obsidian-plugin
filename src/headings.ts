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
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  return end === -1 ? lines.length : end + 1;
}

function headingLines(lines: string[]): { line: number; heading: string }[] {
  const out: { line: number; heading: string }[] = [];
  for (let i = bodyStart(lines); i < lines.length; i++)
    if (lines[i].startsWith("## ")) out.push({ line: i, heading: lines[i].slice(3).trim() });
  return out;
}

// Case, spacing and punctuation set aside.
const folded = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

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
// punctuation are set aside, or within two edits of it. Only a heading the page does not carry
// already, since a second one is a section of the page's own and not a typo of the first.
export function nearMissOf(heading: string, vocabulary: TypeVocabulary, carried: string[]): string | null {
  const mine = folded(heading);
  if (!mine) return null;
  for (const s of vocabulary.sections) {
    if (carried.includes(s.heading)) continue;
    const theirs = folded(s.heading);
    if (mine === theirs || distance(mine, theirs) <= 2) return s.heading;
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
// there is no such heading.
export function missingOf(lines: string[], vocabulary: TypeVocabulary): Missing[] {
  const found = headingLines(lines);
  const order = vocabulary.sections.map((s) => s.heading);
  const out: Missing[] = [];
  for (const [index, section] of vocabulary.sections.entries()) {
    if (!section.required || found.some((h) => h.heading === section.heading)) continue;
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
