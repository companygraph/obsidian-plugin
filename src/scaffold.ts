// A new entity (spec §8): where its file goes and what it starts with. Where is read from the
// package's own list of types, never restated: a type in a folder of its own takes a file named
// by R12, the slug of its H1; an owner such as a process or a profile takes a folder of that name
// with its file inside; an owned type goes into the owner the open note is in, and nowhere when
// the note is in none; a singular type has one fixed file, and is offered only while it does not
// exist. What it starts with is what its schema requires: the required fields, the H1, an empty
// tagline and every required section in the schema's order, a table section with its header.
// Pure.
import { TYPES, slug } from "companygraph-meta-model/checks";
import type { TypeVocabulary } from "./vocabulary.ts";
import { tableStart } from "./headings.ts";

export interface Target {
  type: string;
  // Where the file goes, for the picker to show: a folder, or the singular type's file.
  where: string;
  // A field whose value the filename takes, which is then asked for with the name.
  asks: string | null;
  // The file's path for a name and the asked value, or null when they give no valid one.
  pathFor: (name: string, asked?: string) => string | null;
}

export function targetsFor(model: string, activePath: string | null, exists: (path: string) => boolean): Target[] {
  const rel = activePath?.startsWith(`${model}/`) ? activePath.slice(model.length + 1).split("/") : [];
  const out: Target[] = [];
  for (const t of TYPES) {
    if (t.file) {
      const path = `${model}/${t.file}`;
      if (!exists(path)) out.push({ type: t.type, where: path, asks: null, pathFor: () => path });
      continue;
    }
    if (!t.folder) continue;
    const parts = t.folder.split("/");
    const placeholder = parts.findIndex((p) => p.startsWith("<"));
    let dir: string;
    let own = false;
    if (placeholder === -1) dir = `${model}/${t.folder}`;
    else if (placeholder === parts.length - 1) {
      // An owner: a folder of its own name under the type's folder.
      dir = `${model}/${parts.slice(0, -1).join("/")}`;
      own = true;
    } else {
      // Owned: the owner's segment is taken from the open note, which must lie inside an owner.
      const prefix = parts.slice(0, placeholder);
      if (rel.length < placeholder + 2 || prefix.some((p, i) => rel[i] !== p)) continue;
      dir = `${model}/${[...prefix, rel[placeholder], ...parts.slice(placeholder + 1)].join("/")}`;
    }
    const asks = t.filename?.year ?? null;
    out.push({
      type: t.type,
      where: `${dir}/`,
      asks,
      pathFor: (name, asked) => {
        const base = slug(name);
        if (!base) return null;
        if (asks) {
          const year = asked?.match(/^\d{4}/)?.[0];
          return year ? `${dir}/${year}-${base}.md` : null;
        }
        return own ? `${dir}/${base}/${base}.md` : `${dir}/${base}.md`;
      },
    });
  }
  return out;
}

// The text a new entity starts with, and the line its tagline is on, where the cursor goes.
export function scaffoldOf(vocabulary: TypeVocabulary, name: string, values: Record<string, string> = {}): { text: string; tagline: number } {
  const lines: string[] = [];
  const fields = vocabulary.fields.filter((f) => f.required);
  if (fields.length) {
    lines.push("---");
    // A list is left as its key alone: `[]` would be the flow sequence R11 forbids.
    for (const f of fields) lines.push(values[f.name] && !f.list ? `${f.name}: ${values[f.name]}` : `${f.name}:`);
    lines.push("---", "");
  }
  lines.push(`# ${name}`, "");
  const tagline = lines.length;
  lines.push("> ");
  for (const s of vocabulary.sections.filter((s) => s.required)) lines.push("", `## ${s.heading}`, "", ...tableStart(s));
  return { text: `${lines.join("\n")}\n`, tagline };
}
