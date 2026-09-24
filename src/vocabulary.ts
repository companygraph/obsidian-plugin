// What each type's schema declares, in the shape completion asks for. Every Type cell goes
// through the package's one reader, declarationOf, and every enum's values through
// enumTokensOf; this file reads tables by their column names and interprets nothing.
import { parseSchemas, declarationOf, ownerTypesOf } from "companygraph-meta-model/instance";
import type { Table } from "companygraph-meta-model/instance";
import { enumTokensOf, COLUMN_CAPTION, HEADING_CAPTION } from "companygraph-meta-model/checks";

export type Offer =
  // The canonical names of one type. `optional` where the declaration is `ref?`: a value that
  // names nothing is then a fact and not an error, and nothing marks it.
  | { kind: "names"; target: string; optional?: true }
  | { kind: "values"; values: string[] } // an enum's permitted values
  // R9's `image`: a file beside the note. Nothing is offered for it; the editor draws it.
  | { kind: "image" }
  // `ref → by <Column> in <Owner>` (R4, R9): the names of the type the same row's `by` cell
  // names, within the owner its `in` cell names where that type is owned, resolved by the
  // package's `rowScope` and `resolveRow` against `schemas`, the map the vocabulary was read
  // from. Legal in a column table only; a field declared so is the checks' finding.
  | { kind: "by"; by: string; in: string | null; schemas: Map<string, string> }
  // The column a `by` column reads its type from: every type the vault's core declares, sorted.
  | { kind: "types"; types: string[] }
  // The column a `by … in` column reads its owner from: the names of the type that owns the type
  // the same row's `by` cell names, looked up in `owners`, the package's `ownerTypesOf`.
  | { kind: "owner"; by: string; owners: Map<string, string> }
  | { kind: "none" };

export interface Field { name: string; required: boolean; list: boolean; offer: Offer }
export interface Column { name: string; offer: Offer }
// `grouped`: what the `###` headings of a section declared "Grouped." name, where it is one.
export interface SectionDecl { heading: string; required: boolean; columns: Column[] | null; grouped?: Offer | null }
export interface TypeVocabulary { fields: Field[]; sections: SectionDecl[] }

// A cell as the package reads a schema's cells and a `by` row's type and owner: backticks off, trimmed.
export const bare = (cell: string | undefined) => (cell ?? "").replace(/`/g, "").trim();

function offerOf(type: string | undefined, description: string | undefined, schemas: Map<string, string>): Offer {
  const decl = declarationOf(type);
  if (decl?.by !== undefined) return { kind: "by", by: decl.by, in: decl.in, schemas };
  if (decl) return decl.form === "ref?" ? { kind: "names", target: decl.target, optional: true } : { kind: "names", target: decl.target };
  if (bare(type) === "enum") return { kind: "values", values: enumTokensOf(description ?? "") };
  if (bare(type) === "image") return { kind: "image" };
  return { kind: "none" };
}

// A `by` needs a row to read its type from, and a field or a `###` heading has none (R9): the
// checks say so, and nothing is offered for it.
const rowless = (offer: Offer): Offer => (offer.kind === "by" ? { kind: "none" } : offer);

// The columns a `by` column reads are declared `string`, and what they hold is read from the
// `by` declaration: its `by` column holds a type, its `in` column the owner. A column the
// declaration names that declares an offer of its own keeps it; the checks fail that schema.
// `types` and `owners` are read once per vocabulary, which is once per rebuild.
function rowRead(columns: Column[], types: string[], owners: Map<string, string>): Column[] {
  const read = new Map<string, Offer>();
  for (const c of columns)
    if (c.offer.kind === "by") {
      read.set(c.offer.by, { kind: "types", types });
      if (c.offer.in) read.set(c.offer.in, { kind: "owner", by: c.offer.by, owners });
    }
  return columns.map((c) => (c.offer.kind === "none" && read.has(c.name) ? { ...c, offer: read.get(c.name)! } : c));
}

// One row of a schema table as an object keyed by the table's own column names.
const rowsOf = (table: Table | undefined) =>
  (table?.rows ?? []).map((row) => Object.fromEntries(table!.columns.map((c, i) => [c, row[i]])));

export function vocabularyOf(schemas: Map<string, string>): Map<string, TypeVocabulary> {
  const vocabulary = new Map<string, TypeVocabulary>();
  const entities = parseSchemas(schemas).entities;
  const types = entities.map((e) => e.id.slice("core/".length)).sort((a, b) => a.localeCompare(b));
  const owners = ownerTypesOf(schemas);
  for (const e of entities) {
    const type = e.id.slice("core/".length);
    const frontmatter = e.sections.find((s) => s.heading === "Frontmatter");
    const fields = rowsOf(frontmatter?.table).map((r) => ({
      name: bare(r.Field),
      required: bare(r.Required) === "Yes",
      list: bare(r.Type).startsWith("array of "),
      offer: rowless(offerOf(r.Type, r.Description, schemas)),
    }));

    const tables = e.sections.find((s) => s.heading === "Sections")?.tables ?? [];
    const columnsBySection = new Map<string, Column[]>();
    for (const t of tables) {
      const section = t.caption?.match(COLUMN_CAPTION)?.[1];
      if (!section) continue;
      columnsBySection.set(section.trim(), rowRead(rowsOf(t).map((r) => ({ name: bare(r.Column), offer: offerOf(r.Type, r.Description, schemas) })), types, owners));
    }
    const groupedBySection = new Map<string, Offer>();
    for (const t of tables) {
      const section = t.caption?.match(HEADING_CAPTION)?.[1];
      const row = rowsOf(t)[0];
      if (section && row) groupedBySection.set(section.trim(), rowless(offerOf(row.Type, row.Description, schemas)));
    }
    const index = tables.find((t) => !t.caption);
    const sections = rowsOf(index)
      .filter((r) => bare(r.Section).startsWith("## "))
      .map((r) => {
        const heading = bare(r.Section).slice(3).trim();
        return {
          heading,
          required: bare(r.Required) === "Yes",
          columns: columnsBySection.get(heading) ?? null,
          grouped: groupedBySection.get(heading) ?? null,
        };
      });
    vocabulary.set(type, { fields, sections });
  }
  return vocabulary;
}
