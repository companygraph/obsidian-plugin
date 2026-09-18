// companygraph-meta-model ships JavaScript and no types. These are the exports this plugin
// uses, as lib/checks.mjs and lib/instance.mjs define them.
declare module "companygraph-meta-model/checks" {
  export function checkInstance(
    files: Map<string, string>,
    options?: { core?: string; model?: string },
  ): { failures: string[]; skipped: string[] };
  export function typeOfPath(rel: string, model: string): string | null;
  export function isNewer(a: string, b: string): boolean;
  export function tableOf(body: string): { columns: string[]; rows: string[][] } | null;
  export const COLUMN_CAPTION: RegExp;
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
}
