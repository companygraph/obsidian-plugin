// A new entity (spec §8): where its file goes and what it starts with. Where is read from the
// package's own list of types, never restated: a type in a folder of its own takes a file named
// by R12, the slug of its H1; an owner such as a process or a profile takes a folder of that name
// with its file inside; an owned type goes into the owner the open note is in, and nowhere when
// the note is in none; a singular type has one fixed file, and is offered only while it does not
// exist. What it starts with is what its schema requires: the required fields, the H1, an empty
// tagline and every required section in the schema's order, a table section with its header,
// and first of all an id (R18), made by the package's own maker. Pure but for the random bytes a
// new id takes.
import { DATE, TYPES, slug } from "companygraph-meta-model/checks";
import { idFormatOf, uuidv7 } from "companygraph-meta-model/ids";
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
  // What the new entity still owes that the scaffold cannot write, said once it is made: an
  // owner's first owned entity, whose folder the checks need and git keeps only with a file in
  // it; an owned entity's row in its owner's table, whose place in the order is the author's.
  owes: string | null;
}

export function targetsFor(model: string, activePath: string | null, exists: (path: string) => boolean): Target[] {
  const rel = activePath?.startsWith(`${model}/`) ? activePath.slice(model.length + 1).split("/") : [];
  const out: Target[] = [];
  for (const t of TYPES) {
    if (t.file) {
      const path = `${model}/${t.file}`;
      if (!exists(path)) out.push({ type: t.type, where: path, asks: null, pathFor: () => path, owes: null });
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
    const owned = TYPES.filter((o) => o.owner === t.type).map((o) => o.type);
    const owes = own && owned.length
      ? `A ${t.type} needs ${owned.map((o) => `its first ${o}`).join(" and ")}: run New entity from it next.`
      : t.owner && placeholder !== -1 && placeholder !== parts.length - 1
        ? `Where the ${t.owner} lists what it owns, add this ${t.type} in its place.`
        : null;
    out.push({
      type: t.type,
      where: `${dir}/`,
      asks,
      owes,
      pathFor: (name, asked) => {
        const base = slug(name);
        if (!base) return null;
        if (asks) {
          // A date in one of the three forms R9 allows, which the checks hold the field to.
          if (!DATE.test(asked ?? "")) return null;
          return `${dir}/${asked!.slice(0, 4)}-${base}.md`;
        }
        return own ? `${dir}/${base}/${base}.md` : `${dir}/${base}.md`;
      },
    });
  }
  return out;
}

// The id a new page starts with (R18): a fresh UUID version 7 where `model/identifier.md`
// declares that format, or where the instance has no identifier file yet, since the format is
// then not the instance's choice to make and every tool makes that one. A pattern is the
// instance's own and says nothing of how an id is made, so none is; nor where the file does not
// read, which the checks report on the file itself. `owes` is then what the author is told.
function newId(identifier: string | null): { id: string | null; owes: string | null } {
  if (identifier === null) return { id: uuidv7(), owes: null };
  const declared = idFormatOf(identifier);
  if (declared.format === "uuidv7") return { id: uuidv7(), owes: null };
  if (declared.format === "pattern")
    return { id: null, owes: "Its id is left blank: model/identifier.md declares a pattern, which the plugin cannot make an id for. Write one that matches it." };
  return { id: null, owes: `Its id is left blank: model/identifier.md does not read (${declared.error}).` };
}

// The text a new entity starts with, the line its tagline is on, where the cursor goes, and what
// it owes that the scaffold could not write. `identifier` is the text of the instance's
// `model/identifier.md`, or null where it has none. The id is written only where the type's
// schema declares one, which every schema does since core 0.49.0, and always as the first line.
export function scaffoldOf(
  vocabulary: TypeVocabulary,
  name: string,
  values: Record<string, string> = {},
  identifier: string | null = null,
): { text: string; tagline: number; owes: string | null } {
  const lines: string[] = [];
  const fields = vocabulary.fields.filter((f) => f.required);
  const declaresId = vocabulary.fields.some((f) => f.name === "id");
  const { id, owes } = declaresId ? newId(identifier) : { id: null, owes: null };
  if (fields.length || declaresId) {
    lines.push("---");
    if (declaresId) lines.push(id ? `id: ${id}` : "id:");
    // A list is left as its key alone: `[]` would be the flow sequence R11 forbids.
    for (const f of fields) if (f.name !== "id") lines.push(values[f.name] && !f.list ? `${f.name}: ${values[f.name]}` : `${f.name}:`);
    lines.push("---", "");
  }
  lines.push(`# ${name}`, "");
  const tagline = lines.length;
  lines.push("> ");
  for (const s of vocabulary.sections.filter((s) => s.required)) lines.push("", `## ${s.heading}`, "", ...tableStart(s));
  return { text: `${lines.join("\n")}\n`, tagline, owes };
}
