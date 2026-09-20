// The family's one Markdown form, written back into a note. Obsidian's table editor rewrites a
// table in the aligned form the moment a cell is edited, and undo gives back the cell but not the
// table; this is what puts the table back. Nothing here is a rule of its own: the rule set is the
// vault's rule set, the one custom rule is the
// conventions' markdown-rules.cjs as this repository vendored it, and markdownlint is the library
// conventions-format runs in CI, at the version it pins. So a note left in Obsidian and a file
// fixed by `conventions-format fix` come out byte for byte the same.
import { lint } from "markdownlint/sync";
import { applyFixes } from "markdownlint";
import type { Configuration } from "markdownlint";
import customRules from "../conventions/markdown-rules.cjs";

// Where a member keeps the rule set, newest first. Conventions v1.21.0 moved it to the root,
// under the name markdownlint-cli2 and the editors built on it discover, and retired the copy
// under conventions/. Both are read because a vault takes a release when its owner says so: one
// still on v1.20.0 keeps the old path, and a plugin that knew only the new one would write
// nothing into it and say the vault has no form. A vault without either has not taken the form.
export const RULE_PATHS = [".markdownlint-cli2.jsonc", "conventions/markdown.markdownlint-cli2.jsonc"];

// What to call the rule set when there is none to name.
export const RULES = RULE_PATHS[0];
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

// The same change as spans of lines, one per run of changed lines, so a line that did not change
// is never replaced. One span from the first difference to the last covered every line between
// them, and a cursor on a line the form never touched was carried to the edge of the span: saving
// a note whose table the form compacted moved the cursor to the table's end. Where the form adds
// or removes lines the runs are found by matching the unchanged lines at both ends, and what lies
// between them is one run. Offsets are into `before`.
export function changesOf(before: string, after: string): { from: number; to: number; insert: string }[] {
  if (before === after) return [];
  const a = before.split("\n");
  const b = after.split("\n");
  const offsets: number[] = [0];
  for (const line of a) offsets.push(offsets[offsets.length - 1] + line.length + 1);
  // The unchanged lines at the head and the tail.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const out: { from: number; to: number; insert: string }[] = [];
  const span = (fromLine: number, toLine: number, lines: string[]) => {
    // Lines fromLine..toLine-1 of `before`, without the newline after the last, become `lines`.
    const from = offsets[fromLine];
    const to = offsets[toLine] - 1;
    out.push({ from, to: Math.max(from, to), insert: lines.join("\n") });
  };
  if (midA.length === midB.length) {
    // Line for line: each run of changed lines on its own.
    for (let i = 0; i < midA.length; i++) {
      if (midA[i] === midB[i]) continue;
      let j = i;
      while (j + 1 < midA.length && midA[j + 1] !== midB[j + 1]) j++;
      span(head + i, head + j + 1, midB.slice(i, j + 1));
      i = j;
    }
    return out;
  }
  if (midA.length === 0) {
    // Lines added only: they go in before the first line of the tail, or at the end.
    const at = offsets[head];
    const insert = midB.join("\n") + "\n";
    return head < a.length ? [{ from: at, to: at, insert }] : [{ from: offsets[a.length] - 1, to: offsets[a.length] - 1, insert: "\n" + midB.join("\n") }];
  }
  if (midB.length === 0) {
    // Lines removed only, each with the newline after it — except at the end of the text, where
    // the last line has none of its own and the newline before the run goes instead. Taking the
    // one after each there left a newline behind, so what was written was never what was asked
    // for: MD047 and MD012 strip the blank lines off a note's end, the note was read back still
    // out of form, written again, and a note ending in blank lines never settled.
    const toEnd = head + midA.length >= a.length;
    const from = toEnd ? Math.max(0, offsets[head] - 1) : offsets[head];
    const to = toEnd ? before.length : Math.min(offsets[head + midA.length], before.length);
    return [{ from, to: Math.max(from, to), insert: "" }];
  }
  span(head, head + midA.length, midB);
  return out;
}

// Where a cursor at `ch` in a line stands once the form has rewritten the line. The form changes
// spacing and never what is written, so the cursor keeps the characters before it that are not
// spaces: in `| a   | b   |` just after `b`, it is just after `b` in `| a | b |` too.
export function columnAfter(before: string, after: string, ch: number): number {
  const kept = before.slice(0, ch).replace(/\s/g, "").length;
  if (kept === 0) return Math.min(ch, after.length);
  let seen = 0;
  for (let i = 0; i < after.length; i++) {
    if (!/\s/.test(after[i])) seen++;
    if (seen === kept) return i + 1;
  }
  return after.length;
}
