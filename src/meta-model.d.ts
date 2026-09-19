// companygraph-meta-model ships JavaScript and no types. These are the exports this plugin
// uses, as lib/checks.mjs and lib/instance.mjs define them.
declare module "companygraph-meta-model/checks" {
  // Every type core ships, as the package lists it: its folder or its single file, and what owns
  // or is owned by it.
  export const TYPES: {
    type: string; folder?: string; file?: string; owner?: string; owns?: string[];
    // A type named other than by R12's slug says how: the year of a field, then a chosen slug.
    filename?: { year: string; rest: string };
  }[];
  // R12's slug: lower case, every run of other characters one hyphen, none at either end.
  export function slug(s: string): string;
  export function checkInstance(
    files: Map<string, string>,
    options?: { core?: string; model?: string },
  ): { failures: string[]; skipped: string[] };
  export function typeOfPath(rel: string, model: string): string | null;
  export function isNewer(a: string, b: string): boolean;
  export function tableOf(body: string): { columns: string[]; rows: string[][] } | null;
  // Heading → the text under it, keyed by the heading's own words; "" holds what stands above
  // the first `## `.
  export function sectionsOf(text: string): Map<string, string>;
  export const COLUMN_CAPTION: RegExp;
  export function enumTokensOf(description: string): string[];
}

declare module "companygraph-meta-model/instance" {
  export interface Table { caption: string | null; columns: string[]; rows: string[][] }
  export interface Section { heading: string; text: string; tables: Table[]; table?: Table }
  export interface Entity {
    id: string; type: string; name: string; tagline: string;
    fields: Record<string, string | string[]>;
    sections: Section[]; owner: string | null; path: string;
  }
  export interface Graph { entities: Entity[]; edges: unknown[]; types: unknown[]; root: string; rootId: string | null }
  export function parseInstance(files: Map<string, string>, options: { sub?: string; schemas: Map<string, string> }): Graph;
  export function parseSchemas(files: Map<string, string>, options?: { sub?: string }): Graph;
  export interface Declaration { form: "ref" | "ref?" | "qualifier"; target: string }
  export function declarationOf(cell: string | undefined): Declaration | null;
}
