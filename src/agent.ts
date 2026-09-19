// The agent pass (docs/superpowers/specs/2026-09-19-agent-pass-design.md): what the agent is asked
// and how its answer is read. The instance's own companygraph-validate skill is the authority on
// what the writing rules are; this names its step 8, the files, and the shape of the answer, and
// says nothing of the rules themselves. Pure.
export type Scope = { kind: "note"; path: string } | { kind: "instance"; model: string };

export const SKILL = "companygraph-validate";

export function promptFor(scope: Scope): string {
  const what =
    scope.kind === "note"
      ? `the entity in the file ${scope.path}`
      : `every entity under ${scope.model}/`;
  return [
    `Run step 8 of the ${SKILL} skill, and no other step: the mechanical rules are checked elsewhere.`,
    `Judge ${what} against its schema's writing rules, one rule at a time, with the gap lines and the lines only reading can judge that step 8 names.`,
    "Report a breach, not a rule kept.",
    "For each breach, give the file's path from the vault's root, the line it is on counted from one as the file has it, the entity's type, the rule in the schema's own words, and one or two sentences on why.",
    "List what you did not judge, so a clean answer is not read as more than it is.",
    "Read files only; change nothing.",
  ].join("\n");
}

export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    judgments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          line: { type: "integer" },
          type: { type: "string" },
          rule: { type: "string" },
          judgment: { type: "string" },
        },
        required: ["path", "line", "type", "rule", "judgment"],
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: { profile: { type: "string" }, role: { type: "string" }, skill: { type: "string" } },
        required: ["profile", "role", "skill"],
      },
    },
    notJudged: { type: "array", items: { type: "string" } },
  },
  required: ["judgments", "gaps", "notJudged"],
};

export interface Judgment {
  path: string;
  line: number; // zero-based
  type: string;
  rule: string;
  judgment: string;
  // "line": on its line; "loose": its line is past the file's end, so on the first; "instance":
  // its path is no entity of the vault, so under the instance.
  placed: "line" | "loose" | "instance";
}
export interface Gap { profile: string; role: string; skill: string }
export interface Answer { judgments: Judgment[]; gaps: Gap[]; notJudged: string[] }
export interface RunInfo { cost: number | null; turns: number | null; denied: string[] }
export type ReadAnswer = { ok: true; answer: Answer; info: RunInfo } | { ok: false; why: string; head: string };

const isString = (v: unknown): v is string => typeof v === "string";
// A non-null, non-array object: what JSON calls an object. `null` parses as valid JSON but is
// not one, and reading a field off it would throw, so every field access below goes through this.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const head = (text: string) => text.split("\n").slice(0, 5).join("\n").slice(0, 400);

// The answer Claude Code prints with `--output-format json`, read against the shape asked for.
// `lineCount` says how many lines a path's file has, or null where it is no entity of the vault.
// Never throws: anything not in the shape, at any depth, is refused rather than read.
export function readAnswer(stdout: string, lineCount: (path: string) => number | null): ReadAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, why: "the agent's answer is not JSON", head: head(stdout) };
  }
  if (!isObj(parsed)) return { ok: false, why: "the agent's answer is not in the shape asked for", head: head(stdout) };
  const envelope = parsed;
  if (envelope.is_error === true)
    return { ok: false, why: `the agent reported an error: ${String(envelope.subtype ?? "")} ${String(envelope.result ?? "")}`.trim(), head: head(stdout) };
  const out = envelope.structured_output;
  const judgments = isObj(out) ? out.judgments : undefined;
  const gaps = isObj(out) ? out.gaps : undefined;
  const notJudged = isObj(out) ? out.notJudged : undefined;
  if (!Array.isArray(judgments) || !Array.isArray(gaps) || !Array.isArray(notJudged) || !notJudged.every(isString))
    return { ok: false, why: "the agent's answer is not in the shape asked for", head: head(stdout) };
  const read: Judgment[] = [];
  for (const j of judgments) {
    if (!isObj(j) || !isString(j.path) || typeof j.line !== "number" || !isString(j.type) || !isString(j.rule) || !isString(j.judgment))
      return { ok: false, why: "a judgment in the agent's answer is not in the shape asked for", head: head(stdout) };
    const count = lineCount(j.path);
    const line = Math.floor(j.line) - 1;
    const placed = count === null ? "instance" : line < 0 || line >= count ? "loose" : "line";
    read.push({ path: j.path, line: placed === "line" ? line : 0, type: j.type, rule: j.rule, judgment: j.judgment, placed });
  }
  const readGaps: Gap[] = [];
  for (const g of gaps) {
    if (!isObj(g) || !isString(g.profile) || !isString(g.role) || !isString(g.skill))
      return { ok: false, why: "a gap in the agent's answer is not in the shape asked for", head: head(stdout) };
    readGaps.push({ profile: g.profile, role: g.role, skill: g.skill });
  }
  const denials = Array.isArray(envelope.permission_denials) ? envelope.permission_denials : [];
  return {
    ok: true,
    answer: { judgments: read, gaps: readGaps, notJudged },
    info: {
      cost: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null,
      turns: typeof envelope.num_turns === "number" ? envelope.num_turns : null,
      denied: denials.map((d) => String(isObj(d) ? (d.tool_name ?? "a tool") : "a tool")),
    },
  };
}
