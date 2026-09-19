// The writing brief (spec §8): what a schema says about the place the cursor is in, beside the
// editor. The writing rules are the half of a schema no check reads, since each is a judgment, and
// the person writing and the agent asked later both work from them; this puts them where the
// writing happens. Read from the schema as it stands, never restated: its purpose, the row of the
// sections or frontmatter table for the place, and its writing rules, those that name the place
// first. Pure: a schema's text and a place in, a brief out.
import { sectionsOf, tableOf } from "companygraph-meta-model/checks";

export interface Rule { text: string; names: boolean }

export interface Brief {
  // Where the cursor is, in the schema's words: `## What it takes`, `source`, the H1 or the tagline.
  place: string | null;
  required: boolean | null;
  description: string | null;
  purpose: string | null;
  rules: Rule[];
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

export function briefOf(schema: string, place: Place): Brief {
  const sections = sectionsOf(schema);
  const purpose = (sections.get("Purpose") ?? "").trim() || null;
  let label: string | null = null;
  let required: boolean | null = null;
  let description: string | null = null;
  let mentions: (rule: string) => boolean = () => false;

  if (place.kind === "field") {
    const row = tableOf((sections.get("Frontmatter") ?? "").trim())?.rows.find((r) => bare(r[0]) === place.name);
    label = place.name;
    if (row) {
      required = bare(row[1]) === "Yes";
      description = (row[3] ?? "").trim() || null;
    }
    mentions = (rule) => rule.includes(`\`${place.name}\``);
  } else {
    const rows = tableOf((sections.get("Sections") ?? "").trim())?.rows ?? [];
    const row =
      place.kind === "section"
        ? rows.find((r) => bare(r[0]) === `## ${place.heading}`)
        : rows.find((r) => bare(r[0]).startsWith(place.kind === "top" ? "# " : "> "));
    label = place.kind === "section" ? `## ${place.heading}` : row ? bare(row[0]) : null;
    if (row) {
      required = bare(row[1]) === "Yes";
      description = (row[2] ?? "").trim() || null;
    }
    if (place.kind === "section") {
      // `## Skill` names no rule about `## Skills`: the heading ends where a word does.
      const at = new RegExp(`## ${place.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u");
      mentions = (rule) => at.test(rule);
    }
    else if (place.kind === "tagline") mentions = (rule) => /tagline|`>`/i.test(rule);
  }

  const all = bullets(sections.get("Writing rules") ?? "").map((text) => ({ text, names: mentions(text) }));
  return {
    place: label,
    required,
    description,
    purpose,
    rules: [...all.filter((r) => r.names), ...all.filter((r) => !r.names)],
  };
}

// The place a line of a page is in. A line inside the frontmatter is the field it belongs to, a
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
