// Live Preview draws the frontmatter as Obsidian's Properties widget, so a failure about a
// frontmatter line has no text line to be marked on there. Each row of the widget carries its
// field's name in the page's markup, which is what themes style it by; this module decides
// which field a line belongs to and which rules tint its row. Pure: the Obsidian-facing
// modules only place the result.
import { frontmatterEnd } from "./context.ts";

// The field a frontmatter line belongs to: its own key, or for an entry of a block sequence
// the key above it. null for the fences, a blank line, and anything outside the frontmatter.
export function fieldOfLine(lines: string[], line: number): string | null {
  const end = frontmatterEnd(lines);
  if (end < 0 || line <= 0 || line >= end) return null;
  let at = line;
  while (at > 0 && /^\s*-\s/.test(lines[at] ?? "")) at--;
  return (lines[at] ?? "").match(/^([\w-]+):/)?.[1] ?? null;
}

// The stylesheet text that tints the rows of these fields in one leaf. A stylesheet and not a
// class on the rows, because the widget redraws its rows on every edit and a rule survives that.
// A name that is not a plain key writes no rule: the text goes into a style element.
export function propertyRules(leaf: string, fields: string[]): string {
  return [...new Set(fields)]
    .filter((field) => /^[\w-]+$/.test(field) && /^[\w-]+$/.test(leaf))
    .map((field) =>
      `[data-companygraph-leaf="${leaf}"] .metadata-property[data-property-key="${field}"] ` +
      `{ background-color: rgba(var(--color-red-rgb), 0.12); }`)
    .join("\n");
}
