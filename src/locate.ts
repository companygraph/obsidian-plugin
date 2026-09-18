// A failure is a string. Until the checks return a structure, this reads it: the file from the
// path the message opens with, the line from the value or the field the message quotes.
export interface Located {
  path: string | null; // null: the failure is about the instance, not one file
  line: number;        // zero-based; 0 when nothing in the message could be found in the file
  message: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unquoted = (s: string) => s.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

// The whole tokens a line offers: the scalar after a frontmatter key, the item of a list line,
// every cell of a table row, the text of a `### ` heading. A value is a fragment of a longer
// name until it is one of these.
function tokens(line: string): string[] {
  const t = line.trim();
  const out: string[] = [];
  const scalar = t.match(/^[\w-]+:\s*(.+)$/);
  if (scalar) out.push(unquoted(scalar[1].trim()));
  const item = t.match(/^-\s+(.+)$/);
  if (item) out.push(unquoted(item[1].trim()));
  if (t.startsWith("|")) {
    const cells = t.split("|");
    if (cells[cells.length - 1].trim() === "") cells.pop();
    out.push(...cells.slice(1).map((c) => c.trim()));
  }
  if (t.startsWith("### ")) out.push(t.slice(4).trim());
  return out;
}

// The first line of `scope` where a value sits as a whole token; failing that, the first where
// one reads anywhere, which is how a half-typed value that is nobody's whole token still lands
// somewhere. -1 when no value reads at all.
function seek(lines: string[], scope: number[], values: string[]): number {
  for (const value of values) for (const i of scope) if (tokens(lines[i]).includes(value)) return i;
  for (const value of values) for (const i of scope) if (lines[i].includes(value)) return i;
  return -1;
}

const upto = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

export function locate(failure: string, files: Map<string, string>): Located {
  // The file a failure opens with, found as the longest path of the map the failure leads with.
  // No pattern reads the path: Obsidian names a note "Untitled 1.md" by default, and a path with
  // a space in it is exactly the file an R12 failure is about.
  let lead: string | null = null;
  for (const path of files.keys())
    if ((failure.startsWith(path + ":") || failure.startsWith(path + " ")) && path.length > (lead?.length ?? 0))
      lead = path;
  if (!lead) return { path: null, line: 0, message: failure };
  const message = failure.startsWith(lead + ": ") ? failure.slice(lead.length + 2) : failure;
  const lines = files.get(lead)!.split("\n");
  const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const values = [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // A backticked token is a frontmatter field only inside the frontmatter block; a file with no
  // frontmatter has none for the message to be naming.
  const fields = fmEnd > 0 ? [...message.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : [];

  // A field the message names: its own line, or the line under it that carries the value, which
  // is where an entry of a block sequence sits.
  for (const field of fields) {
    const at = lines.slice(0, fmEnd).findIndex((l) => new RegExp(`^${escape(field)}:`).test(l));
    if (at < 0) continue;
    const scope = [at];
    for (let i = at + 1; i < fmEnd && /^\s+-\s/.test(lines[i]); i++) scope.push(i);
    const hit = seek(lines, scope, values);
    return { path: lead, line: hit < 0 ? at : hit, message };
  }

  // A quoted value that opens with "## " is a section anchor, not a location: a body table's
  // and a grouped heading's failures both quote their section before the value that actually
  // failed, and that value can also read earlier in the file — in prose, or in an earlier
  // section — so the search for it starts at the anchor and never before it. Nothing found
  // under the anchor: the anchor's own line is the best answer on offer.
  const heading = values.find((v) => v.startsWith("## "));
  if (heading !== undefined) {
    const at = lines.findIndex((l) => l.trim() === heading);
    if (at >= 0) {
      const hit = seek(lines, upto(at + 1, lines.length), values.filter((v) => v !== heading));
      return { path: lead, line: hit < 0 ? at : hit, message };
    }
  }
  const hit = seek(lines, upto(0, lines.length), values);
  return { path: lead, line: hit < 0 ? 0 : hit, message };
}
