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
  const values = [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const fields = [...message.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

  // A field the message names: its own line, or the line under it that carries the value, which
  // is where an entry of a block sequence sits.
  for (const field of fields) {
    const at = lines.findIndex((l) => new RegExp(`^${escape(field)}:`).test(l));
    if (at < 0) continue;
    for (const value of values) {
      for (let i = at; i < lines.length && (i === at || /^\s+-\s/.test(lines[i])); i++)
        if (lines[i].includes(value)) return { path: lead, line: i, message };
    }
    return { path: lead, line: at, message };
  }
  for (const value of values) {
    const at = lines.findIndex((l) => l.includes(value));
    if (at >= 0) return { path: lead, line: at, message };
  }
  return { path: lead, line: 0, message };
}
