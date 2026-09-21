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
  export const HEADING_CAPTION: RegExp;
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
