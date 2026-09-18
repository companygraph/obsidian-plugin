// What each type's schema declares, in the shape completion asks for. Every Type cell goes
// through the package's one reader, declarationOf, and every enum's values through
// enumTokensOf; this file reads tables by their column names and interprets nothing.
import { parseSchemas, declarationOf } from "companygraph-meta-model/instance";
import type { Table } from "companygraph-meta-model/instance";
import { enumTokensOf, COLUMN_CAPTION } from "companygraph-meta-model/checks";

export type Offer =
  | { kind: "names"; target: string }   // the canonical names of one type
  | { kind: "values"; values: string[] } // an enum's permitted values
  | { kind: "none" };

export interface Field { name: string; required: boolean; list: boolean; offer: Offer }
export interface Column { name: string; offer: Offer }
export interface SectionDecl { heading: string; required: boolean; columns: Column[] | null }
export interface TypeVocabulary { fields: Field[]; sections: SectionDecl[] }

const bare = (cell: string | undefined) => (cell ?? "").replace(/`/g, "").trim();

function offerOf(type: string | undefined, description: string | undefined): Offer {
  const decl = declarationOf(type);
  if (decl) return { kind: "names", target: decl.target };
  if (bare(type) === "enum") return { kind: "values", values: enumTokensOf(description ?? "") };
  return { kind: "none" };
}

// One row of a schema table as an object keyed by the table's own column names.
const rowsOf = (table: Table | undefined) =>
  (table?.rows ?? []).map((row) => Object.fromEntries(table!.columns.map((c, i) => [c, row[i]])));

export function vocabularyOf(schemas: Map<string, string>): Map<string, TypeVocabulary> {
  const vocabulary = new Map<string, TypeVocabulary>();
  for (const e of parseSchemas(schemas).entities) {
    const type = e.id.slice("core/".length);
    const frontmatter = e.sections.find((s) => s.heading === "Frontmatter");
    const fields = rowsOf(frontmatter?.table).map((r) => ({
      name: bare(r.Field),
      required: bare(r.Required) === "Yes",
      list: bare(r.Type).startsWith("array of "),
      offer: offerOf(r.Type, r.Description),
    }));

    const tables = e.sections.find((s) => s.heading === "Sections")?.tables ?? [];
    const columnsBySection = new Map<string, Column[]>();
    for (const t of tables) {
      const section = t.caption?.match(COLUMN_CAPTION)?.[1];
      if (!section) continue;
      columnsBySection.set(section.trim(), rowsOf(t).map((r) => ({ name: bare(r.Column), offer: offerOf(r.Type, r.Description) })));
    }
    const index = tables.find((t) => !t.caption);
    const sections = rowsOf(index)
      .filter((r) => bare(r.Section).startsWith("## "))
      .map((r) => {
        const heading = bare(r.Section).slice(3).trim();
        return { heading, required: bare(r.Required) === "Yes", columns: columnsBySection.get(heading) ?? null };
      });
    vocabulary.set(type, { fields, sections });
  }
  return vocabulary;
}
