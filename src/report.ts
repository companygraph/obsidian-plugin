// What a report says, once: the pane draws it and Copy report writes it as text, and both read
// it from here so that what is pasted elsewhere is what was on the screen. Pure.
import type { Located } from "./locate.ts";

export interface Report {
  status: "idle" | "checking" | "refused" | "checked";
  notice: string | null;
  located: Located[];
  skipped: string[];
}

export interface Group { title: string; path: string | null; entries: Located[] }

export const IDLE_TEXT =
  "This vault has no .companygraph/manifest.json, so it is not an instance and nothing is checked." +
  ' Run "CompanyGraph: Check the instance now" after adding one.';

// Failures by file, in the order files first appear; a failure about no one file belongs to
// the instance.
export function groupsOf(located: Located[]): Group[] {
  const groups = new Map<string | null, Group>();
  for (const found of located) {
    if (!groups.has(found.path)) groups.set(found.path, { title: found.path ?? "The instance", path: found.path, entries: [] });
    groups.get(found.path)!.entries.push(found);
  }
  return [...groups.values()];
}

// Every report ends with this, because a green list alone reads as a validated instance.
export function notChecked(skipped: string[]): string[] {
  return [
    ...skipped.map((type) => `${type}: the vendored core carries no schema for it`),
    "every ## Writing rules in every schema: that is the agent pass, R0",
  ];
}

export function headline(report: Report): string {
  if (report.status === "checking") return "checking";
  if (report.status === "idle") return "not an instance";
  if (report.status === "refused") return "not checked";
  const count = report.located.length;
  return count === 0 ? "the mechanical checks pass" : `${count} failure${count > 1 ? "s" : ""}`;
}

// The report as plain text, for pasting to an agent or into an issue. Lines are counted from
// one here, as a person counts them; inside the plugin they are zero-based.
export function reportText(report: Report): string {
  const out = [`CompanyGraph checks: ${headline(report)}`];
  if (report.status === "idle") out.push(IDLE_TEXT);
  if (report.notice) out.push(report.notice);
  if (report.status === "checked") {
    for (const group of groupsOf(report.located)) {
      out.push("", group.title);
      for (const found of group.entries) out.push(group.path ? `- line ${found.line + 1}: ${found.message}` : `- ${found.message}`);
    }
    out.push("", "Not checked", ...notChecked(report.skipped).map((line) => `- ${line}`));
  }
  return out.join("\n") + "\n";
}
