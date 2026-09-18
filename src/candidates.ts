// What is offered in one context. Schemas say what may be written, the last parsed graph says
// which names exist, the file says what is already there. Nothing is offered that would not
// resolve, and nothing is wrapped: a name is inserted plain (R3).
import { sectionsOf } from "companygraph-meta-model/checks";
import type { Context } from "./context.ts";
import { frontmatterEnd } from "./context.ts";
import type { Offer, TypeVocabulary } from "./vocabulary.ts";

export interface Candidate { label: string; insert: string }

export interface Position { line: number; ch: number }

// Where the cursor belongs once a candidate is inserted: at the end of what was written, which
// for a list's `name:\n  - ` is on the entry it opened and not on the key's line.
export function cursorAfter(start: Position, insert: string): Position {
  const written = insert.split("\n");
  const last = written[written.length - 1];
  return written.length === 1
    ? { line: start.line, ch: start.ch + last.length }
    : { line: start.line + written.length - 1, ch: last.length };
}

const requiredFirst = <T extends { required: boolean }>(items: T[]) =>
  [...items.filter((i) => i.required), ...items.filter((i) => !i.required)];

function offered(offer: Offer, names: Map<string, string[]>): string[] {
  if (offer.kind === "names") return names.get(offer.target) ?? [];
  if (offer.kind === "values") return offer.values;
  return [];
}

// Those that start with what is typed, then those that contain it; case does not decide.
function matching(values: string[], typed: string): string[] {
  const t = typed.trim().toLowerCase();
  const starts = values.filter((v) => v.toLowerCase().startsWith(t));
  const holds = values.filter((v) => !v.toLowerCase().startsWith(t) && v.toLowerCase().includes(t));
  return [...starts, ...holds];
}

export function candidatesFor(
  context: Context,
  vocabulary: TypeVocabulary,
  names: Map<string, string[]>,
  lines: string[],
): Candidate[] {
  // On a key line, a list entry and a cell, Enter belongs to the editor: it ends the block, the
  // list, the row. A popup that opens before anything is typed takes that Enter and writes its
  // first candidate, so there nothing is offered until something is typed. After `key: ` and
  // after `## ` the position itself asks, and an empty one still offers.
  const asks = context.kind === "heading" || (context.kind === "value" && !context.item);
  if (!asks && context.typed.trim() === "") return [];
  const candidates = offers(context, vocabulary, names, lines);
  // What is typed is already one of the things on offer: there is nothing left to complete, and
  // a popup still open over it captures the Enter that belongs to the editor. One candidate is
  // not the test — `Java` typed in full still matches `JavaScript` — what is typed is.
  return candidates.some((c) => c.insert.trim() === context.typed.trim()) ? [] : candidates;
}

function offers(
  context: Context,
  vocabulary: TypeVocabulary,
  names: Map<string, string[]>,
  lines: string[],
): Candidate[] {
  if (context.kind === "key") {
    const end = frontmatterEnd(lines);
    const present = new Set(lines.slice(1, end).map((l) => l.match(/^([\w-]+):/)?.[1]).filter(Boolean));
    const absent = requiredFirst(vocabulary.fields.filter((f) => !present.has(f.name)));
    return matching(absent.map((f) => f.name), context.typed).map((name) => {
      const field = absent.find((f) => f.name === name)!;
      return { label: field.required ? `${name} (required)` : name, insert: field.list ? `${name}:\n  - ` : `${name}: ` };
    });
  }
  if (context.kind === "value") {
    const field = vocabulary.fields.find((f) => f.name === context.field);
    if (!field) return [];
    // A list holds its values on its entries; `skills: ` on the key's own line is R11's flow
    // sequence waiting to happen, and a name offered there would write one.
    if (field.list && !context.item) return [];
    const space = context.glued ? " " : "";
    return matching(offered(field.offer, names), context.typed).map((v) => ({ label: v, insert: space + v }));
  }
  if (context.kind === "cell") {
    const column = vocabulary.sections
      .find((s) => s.heading === context.section)
      ?.columns?.find((c) => c.name === context.column);
    if (!column) return [];
    return matching(offered(column.offer, names), context.typed).map((v) => ({ label: v, insert: v }));
  }
  // What the file already holds is read by the package that reads a section everywhere else,
  // so a heading it counts as present is never offered again.
  const present = sectionsOf(lines.join("\n"));
  const absent = requiredFirst(vocabulary.sections.filter((s) => !present.has(s.heading)));
  return matching(absent.map((s) => s.heading), context.typed).map((heading) => {
    const section = absent.find((s) => s.heading === heading)!;
    return { label: section.required ? `${heading} (required)` : heading, insert: heading };
  });
}
