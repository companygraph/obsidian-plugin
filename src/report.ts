// What a report of the instance's compliance with the meta-model says, once: the pane draws it
// and Copy report writes it as text, and both read
// it from here so that what is pasted elsewhere is what was on the screen. Pure.
import { IMAGE_FILE } from "companygraph-meta-model/instance";
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
  ' Run "CompanyGraph: Check compliance now" after adding one.';

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

// A type whose schema the vendored core does not carry is a type nothing was held to, which is a
// broken or partial copy of core and worth saying. The writing rules were named here too, while
// the agent pass was meant to answer for them; it was built, tried and dropped, and the plugin
// reports compliance with the meta-model and claims nothing about them.
export function noSchemaFor(skipped: string[]): string | null {
  return skipped.length ? `The vendored core carries no schema for ${skipped.join(", ")}, so nothing holds ${skipped.length === 1 ? "that type" : "those types"}.` : null;
}

export function headline(report: Report): string {
  if (report.status === "checking") return "checking";
  if (report.status === "idle") return "not an instance";
  if (report.status === "refused") return "not checked";
  const count = report.located.length;
  return count === 0 ? "the instance complies with the meta-model" : `${count} failure${count > 1 ? "s" : ""}`;
}

// The report as plain text, for pasting to an agent or into an issue. Lines are counted from
// one here, as a person counts them; inside the plugin they are zero-based.
export function reportText(report: Report): string {
  const out = [`CompanyGraph, meta-model compliance: ${headline(report)}`];
  if (report.status === "idle") out.push(IDLE_TEXT);
  if (report.notice) out.push(report.notice);
  if (report.status === "checked") {
    for (const group of groupsOf(report.located)) {
      out.push("", group.title);
      // A picture has no line to point to (R9): its own failure names the file and stops there.
      const withLine = group.path !== null && !IMAGE_FILE.test(group.path);
      for (const found of group.entries) out.push(withLine ? `- line ${found.line + 1}: ${found.message}` : `- ${found.message}`);
    }
    const missing = noSchemaFor(report.skipped);
    if (missing) out.push("", missing);
  }
  return out.join("\n") + "\n";
}
