// What is offered in one context. Schemas say what may be written, the last parsed graph says
// which names exist, the file says what is already there. Nothing is offered that would not
// resolve, and nothing is wrapped: a name is inserted plain (R3).
import type { Context } from "./context.ts";
import { frontmatterEnd } from "./context.ts";
import type { Offer, TypeVocabulary } from "./vocabulary.ts";

export interface Candidate { label: string; insert: string }

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
    return matching(offered(field.offer, names), context.typed).map((v) => ({ label: v, insert: v }));
  }
  if (context.kind === "cell") {
    const column = vocabulary.sections
      .find((s) => s.heading === context.section)
      ?.columns?.find((c) => c.name === context.column);
    if (!column) return [];
    return matching(offered(column.offer, names), context.typed).map((v) => ({ label: v, insert: v }));
  }
  const present = new Set(lines.map((l) => l.match(/^## (.+?)\s*$/)?.[1]).filter(Boolean));
  const absent = requiredFirst(vocabulary.sections.filter((s) => !present.has(s.heading) || s.heading === context.typed.trim()));
  return matching(absent.map((s) => s.heading), context.typed).map((heading) => {
    const section = absent.find((s) => s.heading === heading)!;
    return { label: section.required ? `${heading} (required)` : heading, insert: heading };
  });
}
