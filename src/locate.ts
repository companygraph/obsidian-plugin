// A failure is a string. Until the checks return a structure, this reads it: the file from the
// path the message opens with, the line from the value or the field the message quotes.
export interface Located {
  path: string | null; // null: the failure is about the instance, not one file
  line: number;        // zero-based; 0 when nothing in the message could be found in the file
  message: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function locate(failure: string, files: Map<string, string>): Located {
  const lead = failure.match(/^(\S+?):? /)?.[1] ?? null;
  if (!lead || !files.has(lead)) return { path: null, line: 0, message: failure };
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
    for (const value of values) {
      for (let i = at; i < fmEnd && (i === at || /^\s+-\s/.test(lines[i])); i++)
        if (lines[i].includes(value)) return { path: lead, line: i, message };
    }
    return { path: lead, line: at, message };
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
      for (let i = at + 1; i < lines.length; i++)
        for (const value of values)
          if (value !== heading && lines[i].includes(value)) return { path: lead, line: i, message };
      return { path: lead, line: at, message };
    }
  }
  for (const value of values) {
    const at = lines.findIndex((l) => l.includes(value));
    if (at >= 0) return { path: lead, line: at, message };
  }
  return { path: lead, line: 0, message };
}
