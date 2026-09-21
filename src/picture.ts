// The picture an entity carries, as the editor draws it: which file, on which line, under what
// name. Pure; picturemark.ts draws it. The first field the type's schema declares `image` whose
// value names a file decides it, the file sits beside the note (R9), and the line is the H1's.
import { IMAGE_FILE } from "companygraph-meta-model/instance";
import type { TypeVocabulary } from "./vocabulary.ts";

export interface Picture { file: string; line: number; name: string }

// null where the note carries no picture to draw: no frontmatter, no field declared `image` with
// a plain file name of an image in it, or no H1 to draw it on. A value with a path in it is the
// checks' finding (R9) and draws nothing.
export function pictureOf(text: string, path: string, vocabulary: TypeVocabulary): Picture | null {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const folder = path.slice(0, path.lastIndexOf("/"));
  for (const field of vocabulary.fields) {
    if (field.offer.kind !== "image") continue;
    const written = lines.slice(1, end).find((l) => l.startsWith(`${field.name}:`));
    const value = written?.slice(field.name.length + 1).trim() ?? "";
    if (!value || value.includes("/") || !IMAGE_FILE.test(value)) continue;
    const line = lines.findIndex((l, i) => i > end && l.startsWith("# "));
    if (line < 0) return null;
    return { file: `${folder}/${value}`, line, name: lines[line].slice(2).trim() };
  }
  return null;
}
