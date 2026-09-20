// Whether a name may be an entity's canonical name, and why not when it may not. Both New entity
// and Rename entity ask, and they must ask the same thing: a name that Rename refuses is one New
// entity has no business writing, and a file written with it would fail the checks the moment it
// is saved. Pure.
import { slug } from "companygraph-meta-model/checks";
import { visibleIn } from "./scope.ts";
import type { Named } from "./scope.ts";

// A name is written into table cells and frontmatter values as it stands, so it may hold nothing
// either of those reads as its own: a pipe splits a cell; a quote at either end, a bracket, a
// `#`, `-`, `>`, `&`, `*`, `!`, `%` or `@` at the start, and `: ` or ` #` inside, are YAML's.
const HOSTILE = /\||: | #|^["'\[{#\->&*!%@`]|["']$/;

// What is wrong with this name whatever it would name, or null when nothing is. R12: a name must
// slug to something, since that is the filename derived from it.
export function refusedName(name: string): string | null {
  if (!name || !slug(name)) return "The name has no letter or digit to name a file by.";
  if (HOSTILE.test(name) || /[\r\n]/.test(name))
    return "A name may hold no pipe, no quote at either end, no `: ` or ` #`, and may not open with a sign YAML reads as its own.";
  return null;
}

// R2: a name is unique within its type, and for an owned type within its owner. `at` is the file
// the entity has or would have, because that is what says which owner the name is read in. `except`
// is the entity being renamed, which is not its own collision.
export function refusedHere(
  named: Named[],
  model: string,
  type: string,
  at: string,
  name: string,
  except?: string,
): string | null {
  return visibleIn(named, at, model).some((n) => n.type === type && n.name === name && n.path !== except)
    ? `Another ${type} is named "${name}" already.`
    : null;
}
