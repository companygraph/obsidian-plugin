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
  // R9's date: a year, a year and a month, or a full date. Exported by the package since 0.32.0,
  // so nothing here keeps a second copy of it.
  export const DATE: RegExp;
  // R9's bounds for an image, and what an image's own bytes say it is; null for anything that is
  // neither a PNG nor a JPEG.
  export const IMAGE_BOUNDS: { min: number; max: number; bytes: number };
  export function imageInfoOf(bytes: unknown): { format: "png" | "jpeg"; width: number; height: number } | null;
  // A file IMAGE_FILE matches enters the map as bytes and every other file as text (R9): an
  // image read as text is corrupted before the check that reads its header sees it.
  export function checkInstance(
    files: Map<string, string | Uint8Array>,
    options?: { core?: string; model?: string },
  ): { failures: string[]; skipped: string[] };
  export function typeOfPath(rel: string, model: string): string | null;
  export function isNewer(a: string, b: string): boolean;
  export function tableOf(body: string): { columns: string[]; rows: string[][] } | null;
  // Heading → the text under it, keyed by the heading's own words; "" holds what stands above
  // the first `## `.
  export function sectionsOf(text: string): Map<string, string>;
  export const COLUMN_CAPTION: RegExp;
  export const HEADING_CAPTION: RegExp;
  export function enumTokensOf(description: string): string[];
}

declare module "companygraph-meta-model/instance" {
  // R9's image: `.jpg`, `.jpeg` or `.png`, lowercase. Every reader of an instance decides by it.
  export const IMAGE_FILE: RegExp;
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
  // A declaration names its type, or, in the form `ref → by <Column> in <Owner>` (R4, R9), reads
  // it from its row: `target` is then null, and `by` and `in` name the columns of the same table
  // that carry the type and the owner, `in` null where the form has none.
  export type Declaration =
    | { form: "ref" | "ref?" | "qualifier"; target: string; by?: undefined; in?: undefined }
    | { form: "ref"; target: null; by: string; in: string | null };
  export function declarationOf(cell: string | undefined): Declaration | null;
  // A `ref → by <Column> in <Owner>` row (R4, R9), resolved by the rule the parser resolves it
  // by. `schemas` is keyed `<type>-schema.md`; an entity needs only `{ type, name, path }`; the
  // row's cells are passed bare. Each call reads the schemas again and keeps nothing.
  export interface RowEntity { type: string; name: string; path: string }
  export type RowError = { error: string; subject: "value" | "owner" };
  // Every owned type mapped to its owner type, from the schemas' `**Owner:**` lines (R10).
  export function ownerTypesOf(schemas: Map<string, string>): Map<string, string>;
  // What a row's Type and Owner cells narrow the entities down to.
  export function rowScope<E extends RowEntity>(entities: E[], schemas: Map<string, string>, row: { type: string; owner?: string }):
    | { within: E[]; error?: undefined }
    | (RowError & { within?: undefined });
  // The one entity a row's name names within that scope.
  export function resolveRow<E extends RowEntity>(entities: E[], schemas: Map<string, string>, row: { type: string; name: string; owner?: string }):
    | { entity: E; error?: undefined }
    | (RowError & { entity?: undefined });
}

declare module "companygraph-meta-model/plan" {
  // Where the agent's skills are written, and what `init` and `upgrade` would write: a plan, or a
  // refusal saying why nothing may be. Maps are path → text.
  export const SKILLS: string;
  export function initPlan(ask: {
    core: Map<string, string>; skills?: Map<string, string>; tooling: string; tag: string; name: string;
    agent: string; units?: string; folders?: string[]; present?: Set<string>; fetched?: boolean;
  }): { refused: string; writes?: undefined } | { refused?: undefined; writes: Map<string, string> };
  export function upgradePlan(ask: {
    core: Map<string, string>; skills?: Map<string, string>; tooling: string; tag: string;
    manifest: { files?: Record<string, string>; units?: string; core?: { version?: string }; tooling?: string };
    held: Map<string, string>; workflow: string | null; fetched?: boolean; force?: boolean;
  }):
    | { refused: string }
    | { refused?: undefined; writes: Map<string, string>; removes: string[]; edited: string[]; missing: string[]; from: string; to: string };
}

// Not bundled: the e2e harness installs the build into its vault through the same code the
// tooling's `obsidian` command runs, so every e2e run proves what that command writes.
declare module "companygraph-meta-model/obsidian" {
  export type Files = Map<string, Buffer>;
  export function readLocal(dir: string): Files;
  export function place(vault: string, files: Files): { folder: string; from: string | null; to: string; enabled: boolean };
}
