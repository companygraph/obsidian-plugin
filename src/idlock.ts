// The lock on a page's `id` (spec §8). Since core 0.49.0 every page carries an id (R18) that is
// set once and never changed, so once a page's id has a value the editor refuses an edit that
// changes or removes it. A blank `id:` stays open, so an author under a declared pattern can fill
// it in, and a page without one may gain one. Which edits are held is the heading lock's list,
// headings.ts's `isHeld`, and not a second one. Pure; the editor-facing half is headingmarks.ts.
import { frontmatterEnd } from "./context.ts";
import { isHeld } from "./headings.ts";

// The id a page carries: its value, with one pair of YAML's quotes and a trailing comment set
// aside; "" where the line is there and blank; null where the frontmatter has no top-level `id:`
// line, or the page no frontmatter that has closed. A line may end in a carriage return.
export function idOf(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const end = frontmatterEnd(lines);
  for (let i = 1; i < end; i++) {
    const found = lines[i].match(/^id:(.*)$/);
    if (!found) continue;
    const value = found[1].trim();
    const quoted = value.match(/^(["'])(.*?)\1(\s+#.*)?$/);
    if (quoted) return quoted[2];
    // A comment opens at a `#` that starts the value or follows a space, as YAML reads it, and
    // YAML's null is no id at all: blank, so the page is not locked and may be filled.
    const bare = value.startsWith("#") ? "" : value.replace(/\s+#.*$/, "");
    return /^(~|null|Null|NULL)$/.test(bare) ? "" : bare;
  }
  return null;
}

// The id an edit loses: the one held, when it has a value and the page after the edit no longer
// carries it, changed, blank or gone. Null when the edit keeps it, or when nothing is held yet.
export function lostId(held: string | null, after: string): string | null {
  if (!held) return null;
  return idOf(after) === held ? null : held;
}

// Whether a write of the Properties widget, the frontmatter it would save, loses the id held. The
// widget writes this way in every view, Reading view included, where no editor sees the write, so
// this is decided before it is made. YAML hands a bare number over as one, and a numeric id is
// compared as a number for that reason.
export function lostInProperties(held: string | null, frontmatter: unknown): boolean {
  if (!held) return false;
  const id = frontmatter && typeof frontmatter === "object" ? (frontmatter as Record<string, unknown>).id : undefined;
  if (typeof id === "string") return id.trim() !== held;
  if (typeof id === "number") return id !== Number(held);
  return true;
}

// Whether the id lock looks at an edit. Every edit the heading lock holds, and besides those the
// Properties widget's own write: the widget writes through the editor with the event `set`, the
// same event as a file reloaded from disk, which must pass, so only knowing that the widget is
// writing tells the two apart.
export const holdsEdit = (event: string | undefined, fromProperties: boolean) => fromProperties || isHeld(event);

// The id the lock holds, and the one it held before the last `set` moved it.
export interface Held { held: string | null; before: string | null }

// The id the lock holds after an edit that passed. It is the page's id as the editor took it from
// the file, when the note was opened or reloaded, or as the widget wrote it: both arrive as `set`.
// Typing does not move it, so a blank id stays open while it is written, and is held from the
// next time the note is opened. Undo and redo move it back and forth only where they bring back
// the id held before the last `set`: an undo of the widget filling a blank id opens it again.
export function heldAfter(hold: Held, event: string | undefined, after: string): Held {
  if (event === "set" || event?.startsWith("set.")) return { held: idOf(after), before: hold.held };
  if (event === "undo" || event === "redo") {
    const now = idOf(after);
    if (now !== hold.held && now === hold.before) return { held: now, before: hold.held };
  }
  return hold;
}

// What an editor does to the attribute on its view's container that draws the id's row locked.
// Only the note's own editor touches it: a canvas's node editors share one container, and a
// table cell's editor sits inside the note's, so either would mark or clear a row not its own.
export function containerMark(locked: boolean, owned: boolean): "set" | "remove" | "leave" {
  if (!owned) return "leave";
  return locked ? "set" : "remove";
}

// A press on the locked value, from the button going down to it coming up: it copies the id
// with the primary button only, and only where the pointer stayed put, so a drag copies nothing.
export interface Press { button: number; x: number; y: number }
export function isCopyPress(down: Press | null, up: Press): boolean {
  if (!down || down.button !== 0 || up.button !== 0) return false;
  return Math.abs(up.x - down.x) <= 4 && Math.abs(up.y - down.y) <= 4;
}

// Whether a lock's refusal is told now, given the one told last. A burst of refused keystrokes,
// or one refusal seen from the editor and the widget both, says so once within two seconds; a
// refusal of something else says so at once, so a heading held a moment before never silences
// the id's refusal, nor the id's a heading's.
export interface Told { message: string; at: number }
export function tells(last: Told | null, message: string, now: number): boolean {
  return !last || last.message !== message || now - last.at > 2000;
}
