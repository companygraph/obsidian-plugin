// The writing brief (spec §8): what a schema says about the place the cursor is in, beside the
// editor. The writing rules are the half of a schema no check reads, since each is a judgment, and
// the person writing and the agent asked later both work from them; this puts them where the
// writing happens. Read from the schema as it stands, never restated: its purpose, the row of the
// sections or frontmatter table for the place, and its writing rules, those that name the place
// first and the rest under the place each names first. Pure: a schema's text and a place in, a
// brief out.
import { blocksOf, sectionsOf, tableOf } from "companygraph-meta-model/checks";

// A piece of a rule as a reader sees it: the schema writes a section as `## Why` and a field as
// `decided`, and the pane shows each by its name, not by that syntax. A quoted example is kept
// apart so it can read as one.
export interface Part { kind: "text" | "code" | "example" | "section" | "field"; text: string }

// A place in a page: its H1, its tagline, a `##` section or a frontmatter field, by name.
export type Target = { kind: "title" | "tagline" } | { kind: "section" | "field"; name: string };

export interface Rule { text: string; names: boolean; parts: Part[] }

// The rules that do not name the place, under the place each names first: `title`, `tagline`, the
// section's heading, `frontmatter` for every field, and `page` for a rule that names no place.
export interface Group { key: string; label: string; name: string; rules: Rule[] }

export interface Brief {
  // What sort of place the cursor is in, and its name in the schema's words: the Title
  // `Decision` for `# [Decision]`, the Tagline `Statement` for `> [Statement]`, the Section
  // `Why`, the Field `decided`.
  label: "Title" | "Tagline" | "Section" | "Field";
  name: string;
  required: boolean | null;
  description: string | null;
  // A field's Type cell, and a table section's columns, as the schema declares them.
  type: string | null;
  columns: string[];
  // The purpose's first sentence, and the rest of it.
  purpose: { lead: string; rest: string } | null;
  rules: Rule[];
  groups: Group[];
}

// Where in a page the cursor is: a frontmatter field, a `##` section, or the part above the first
// section, which is the H1 and the tagline.
export type Place = { kind: "field"; name: string } | { kind: "section"; heading: string } | { kind: "top" } | { kind: "tagline" };

// The bullets of a list, each with the lines indented under it joined on.
function bullets(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) out.push(line.slice(2).trim());
    else if (out.length && /^\s+\S/.test(line)) out[out.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

const bare = (cell: string | undefined) => (cell ?? "").replace(/`/g, "").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// What a `# [Decision]` or `> [Statement]` row holds, by the name in its brackets.
const bracketed = (cell: string) => cell.match(/^[#>]\s*\[(.+)\]$/)?.[1].trim() ?? null;

// A rule's text in parts: `## X` a section, a backticked name the frontmatter declares a field,
// any other backticked text code, and a run in double quotes an example.
export function partsOf(rule: string, fields: ReadonlySet<string>): Part[] {
  const out: Part[] = [];
  for (const piece of rule.split(/(`[^`]+`|"[^"]+")/)) {
    if (!piece) continue;
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 1) {
      const inner = piece.slice(1, -1);
      if (inner.startsWith("## ")) out.push({ kind: "section", text: inner.slice(3).trim() });
      else if (fields.has(inner)) out.push({ kind: "field", text: inner });
      else out.push({ kind: "code", text: inner });
    } else if (piece.startsWith('"') && piece.endsWith('"') && piece.length > 1) out.push({ kind: "example", text: piece });
    else out.push({ kind: "text", text: piece });
  }
  return out;
}

// The first sentence of a text, and the rest: a sentence ends at a stop followed by a space and
// a capital or a quote.
function firstSentence(text: string): { lead: string; rest: string } {
  const at = text.match(/^([\s\S]+?[.!?])\s+(?=[A-Z"“])/);
  return at ? { lead: at[1], rest: text.slice(at[0].length).trim() } : { lead: text, rest: "" };
}

export function briefOf(schema: string, place: Place): Brief {
  const sections = sectionsOf(schema);
  const purposeText = (sections.get("Purpose") ?? "").trim();
  const frontmatter = tableOf((sections.get("Frontmatter") ?? "").trim())?.rows ?? [];
  const fields = new Set(frontmatter.map((r) => bare(r[0])));
  const sectionsBody = (sections.get("Sections") ?? "").trim();
  const rows = tableOf(sectionsBody)?.rows ?? [];
  const headings = rows.map((r) => bare(r[0])).filter((c) => c.startsWith("## ")).map((c) => c.slice(3).trim());
  const titleRow = rows.find((r) => bare(r[0]).startsWith("# "));
  const taglineRow = rows.find((r) => bare(r[0]).startsWith("> "));
  const tagline = taglineRow ? bracketed(bare(taglineRow[0])) : null;

  // Where in a rule it names each place: the H1 by that word, the tagline by that word, by `>`
  // or by "the" and the name its row gives it, a section by its heading where the heading ends,
  // and a field by its name in backticks.
  const title = /\bH1\b/;
  const taglineAt = new RegExp(
    `\\btagline\\b|\`>\`${tagline && !headings.includes(tagline) ? `|\\bthe ${escape(tagline)}\\b` : ""}`,
    "i",
  );
  const sectionAt = (heading: string) => new RegExp(`## ${escape(heading)}(?![\\p{L}\\p{N}])`, "u");
  const named = (rule: string): { key: string; at: number }[] => {
    const out: { key: string; at: number }[] = [];
    const t = rule.search(title);
    if (t >= 0) out.push({ key: "title", at: t });
    const g = rule.search(taglineAt);
    if (g >= 0) out.push({ key: "tagline", at: g });
    for (const m of rule.matchAll(/`## ([^`]+)`/g)) out.push({ key: `## ${m[1].trim()}`, at: m.index });
    for (const m of rule.matchAll(/`([^`]+)`/g)) if (fields.has(m[1])) out.push({ key: `field:${m[1]}`, at: m.index });
    return out.sort((a, b) => a.at - b.at);
  };

  let label: Brief["label"];
  let name: string;
  let required: boolean | null = null;
  let description: string | null = null;
  let type: string | null = null;
  let columns: string[] = [];
  let mentions: (rule: string) => boolean;

  if (place.kind === "field") {
    const row = frontmatter.find((r) => bare(r[0]) === place.name);
    label = "Field";
    name = place.name;
    if (row) {
      required = bare(row[1]) === "Yes";
      type = bare(row[2]) || null;
      description = (row[3] ?? "").trim() || null;
    }
    mentions = (rule) => rule.includes(`\`${place.name}\``);
  } else {
    const row =
      place.kind === "section" ? rows.find((r) => bare(r[0]) === `## ${place.heading}`) : place.kind === "top" ? titleRow : taglineRow;
    if (place.kind === "section") {
      label = "Section";
      name = place.heading;
      const at = sectionAt(place.heading);
      mentions = (rule) => at.test(rule);
      columns = (blocksOf(sectionsBody).find((b) => b.section === place.heading)?.table?.rows ?? []).map((r) => bare(r[0]));
    } else if (place.kind === "top") {
      label = "Title";
      name = (row && bracketed(bare(row[0]))) ?? "Title";
      mentions = (rule) => title.test(rule);
    } else {
      label = "Tagline";
      name = tagline ?? "Tagline";
      mentions = (rule) => taglineAt.test(rule);
    }
    if (row) {
      required = bare(row[1]) === "Yes";
      description = (row[2] ?? "").trim() || null;
    }
  }

  const all = bullets(sections.get("Writing rules") ?? "").map((text) => ({ text, names: mentions(text), parts: partsOf(text, fields) }));
  const rules = [...all.filter((r) => r.names), ...all.filter((r) => !r.names)];

  // The rest under the place each names first, in the page's order: the H1, the tagline, the
  // sections as the schema lists them and any it does not after them, the frontmatter, the page.
  const groupOf = (rule: string) => {
    const first = named(rule)[0]?.key;
    return !first ? "page" : first.startsWith("field:") ? "frontmatter" : first;
  };
  const byKey = new Map<string, Rule[]>();
  for (const rule of all.filter((r) => !r.names)) {
    const key = groupOf(rule.text);
    byKey.set(key, [...(byKey.get(key) ?? []), rule]);
  }
  const order = ["title", "tagline", ...headings.map((h) => `## ${h}`)];
  const keys = [
    ...order.filter((k) => byKey.has(k)),
    ...[...byKey.keys()].filter((k) => k.startsWith("## ") && !order.includes(k)),
    ...["frontmatter", "page"].filter((k) => byKey.has(k)),
  ];
  const titleName = (titleRow && bracketed(bare(titleRow[0]))) ?? "Title";
  const groups = keys.map((key): Group => {
    const [groupLabel, groupName] =
      key === "title" ? ["Title", titleName]
      : key === "tagline" ? ["Tagline", tagline ?? "Tagline"]
      : key === "frontmatter" ? ["Fields", "Frontmatter"]
      : key === "page" ? ["Page", "The whole page"]
      : ["Section", key.slice(3)];
    return { key, label: groupLabel, name: groupName, rules: byKey.get(key)! };
  });

  return { label, name, required, description, type, columns, purpose: purposeText ? firstSentence(purposeText) : null, rules, groups };
}

// The line of a page a place is on, or null where the page does not have it: a field's key line
// inside the frontmatter, a section's heading, the H1, and the tagline's first `>` line under it.
export function lineOf(lines: string[], target: Target): number | null {
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  if (target.kind === "field") {
    for (let i = 1; i < end; i++) if (lines[i].startsWith(`${target.name}:`)) return i;
    return null;
  }
  let h1 = -1;
  for (let i = end + 1; i < lines.length; i++) {
    const line = lines[i];
    if (target.kind === "section" && line.startsWith("## ") && line.slice(3).trim() === target.name) return i;
    if (h1 < 0 && line.startsWith("# ")) {
      if (target.kind === "title") return i;
      h1 = i;
    } else if (target.kind === "tagline" && h1 >= 0 && line.startsWith(">")) return i;
    if (target.kind === "tagline" && line.startsWith("## ")) return null;
  }
  return null;
}

// The place of a line of a page. A line inside the frontmatter is the field it belongs to, a
// list's entry the field above it; a line past it is the section above it, or the H1 and tagline
// part above every section, the tagline being the `>` run right under the H1.
export function placeAt(lines: string[], line: number): Place | null {
  let end = -1;
  if (lines[0] === "---") end = lines.indexOf("---", 1);
  if (end > 0 && line > 0 && line < end) {
    for (let i = line; i > 0; i--) {
      const key = lines[i].match(/^([\w-]+):/)?.[1];
      if (key) return { kind: "field", name: key };
      // A comment or a blank line belongs to no field; the field above it answers.
      if (/^\s*#/.test(lines[i]) || lines[i].trim() === "") continue;
      if (!/^\s/.test(lines[i])) return null;
    }
    return { kind: "top" };
  }
  if (end > 0 && line <= end) return null;
  for (let i = line; i > end; i--) {
    if (lines[i].startsWith("## ")) return { kind: "section", heading: lines[i].slice(3).trim() };
  }
  return lines[line]?.startsWith(">") ? { kind: "tagline" } : { kind: "top" };
}
