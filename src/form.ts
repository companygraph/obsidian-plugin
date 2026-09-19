// The family's one Markdown form, written back into a note. Obsidian's table editor rewrites a
// table in the aligned form the moment a cell is edited, and undo gives back the cell but not the
// table; this is what puts the table back. Nothing here is a rule of its own: the rule set is the
// vault's vendored conventions/markdown.markdownlint-cli2.jsonc, the one custom rule is the
// conventions' markdown-rules.cjs as this repository vendored it, and markdownlint is the library
// conventions-format runs in CI, at the version it pins. So a note left in Obsidian and a file
// fixed by `conventions-format fix` come out byte for byte the same.
import { lint } from "markdownlint/sync";
import { applyFixes } from "markdownlint";
import type { Configuration } from "markdownlint";
import customRules from "../conventions/markdown-rules.cjs";

// Where a member keeps the rule set. A vault without it has not taken the form, and nothing is
// written into its notes.
export const RULES = "conventions/markdown.markdownlint-cli2.jsonc";
export const PIN = "conventions.json";

// The rule set out of the file conventions-format hands the CLI; null when it does not parse or
// holds no rules, and then nothing is written. The file is JSON, and a comment line is dropped
// first because the format allows one.
export function formOf(text: string): Configuration | null {
  try {
    const parsed = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
    const config = parsed?.config;
    return config && typeof config === "object" ? (config as Configuration) : null;
  } catch {
    return null;
  }
}

// The folders conventions-format does not read and so this does not write: conventions.json's
// "format-exclude", or its "exclude" where the member names no "format-exclude", as the script
// reads them. An unreadable pin excludes nothing extra.
export function excludesOf(text: string | null): string[] {
  if (text === null) return [];
  try {
    const pin = JSON.parse(text);
    const exclude = pin && "format-exclude" in pin ? pin["format-exclude"] : pin?.exclude;
    return Array.isArray(exclude) ? exclude.filter((e): e is string => typeof e === "string").map((e) => e.replace(/\/+$/, "")) : [];
  } catch {
    return [];
  }
}

// Whether conventions-format reads this path: a Markdown file outside .git, every node_modules and
// the excluded folders.
export function formed(path: string, excludes: string[]): boolean {
  if (!path.endsWith(".md")) return false;
  const parts = path.split("/");
  if (parts[0] === ".git" || parts.includes("node_modules")) return false;
  return !excludes.some((e) => path === e || path.startsWith(e + "/"));
}

// The text in the form. markdownlint applies one fix per line and pass, and a padded table's
// delimiter row takes two, its spacing and its length, so this runs again while a pass still
// changes something, three passes at most, as conventions-format does.
export function inForm(text: string, config: Configuration): string {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const errors = lint({ strings: { note: out }, config, customRules }).note ?? [];
    if (!errors.some((e) => e.fixInfo)) break;
    const next = applyFixes(out, errors);
    if (next === out) break;
    out = next;
  }
  return out;
}

// The one span that differs between two texts, as offsets into the first and the text that
// replaces it, so an editor is handed the change and not a whole new document: the cursor and
// everything outside the span stay where they were. null when the texts are equal.
export function spanOf(before: string, after: string): { from: number; to: number; text: string } | null {
  if (before === after) return null;
  let start = 0;
  const shorter = Math.min(before.length, after.length);
  while (start < shorter && before[start] === after[start]) start++;
  let end = 0;
  while (end < shorter - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { from: start, to: before.length - end, text: after.slice(start, after.length - end) };
}
