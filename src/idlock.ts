// The lock on a page's `id` (spec §8). Since core 0.49.0 every page carries an id (R18) that is
// set once and never changed, so once a page's id has a value the editor refuses an edit that
// changes or removes it. A blank `id:` stays open, so an author under a declared pattern can fill
// it in, and a page without one may gain one. Which edits are held is the heading lock's list,
// headings.ts's `isHeld`, and not a second one. Pure; the editor-facing half is headingmarks.ts.
import { frontmatterEnd } from "./context.ts";
import { isHeld } from "./headings.ts";

// The id a page carries: its value, with one pair of YAML's quotes around it set aside; "" where
// the line is there and blank; null where the frontmatter has no top-level `id:` line, or the
// page no frontmatter that has closed.
export function idOf(text: string): string | null {
  const lines = text.split("\n");
  const end = frontmatterEnd(lines);
  for (let i = 1; i < end; i++) {
    const found = lines[i].match(/^id:(.*)$/);
    if (!found) continue;
    const value = found[1].trim();
    const quoted = value.match(/^(["'])(.*)\1$/);
    return quoted ? quoted[2] : value;
  }
  return null;
}

// The id an edit loses: the one held, when it has a value and the page after the edit no longer
// carries it, changed, blank or gone. Null when the edit keeps it, or when nothing is held yet.
export function lostId(held: string | null, after: string): string | null {
  if (!held) return null;
  return idOf(after) === held ? null : held;
}

// Whether the id lock looks at an edit. Every edit the heading lock holds, and besides those the
// Properties widget's own write: the widget writes through the editor with the event `set`, the
// same event as a file reloaded from disk, which must pass, so only knowing that the widget is
// writing tells the two apart.
export const holdsEdit = (event: string | undefined, fromProperties: boolean) => fromProperties || isHeld(event);

// The id the lock holds after an edit that passed. It is the page's id as the editor took it from
// the file, when the note was opened or reloaded, or as the widget wrote it: both arrive as `set`.
// Typing does not move it, so a blank id stays open while it is written, and is held from the
// next time the note is opened.
export function heldAfter(held: string | null, event: string | undefined, after: string): string | null {
  return event === "set" || event?.startsWith("set.") ? idOf(after) : held;
}
