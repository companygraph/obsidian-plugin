// What the agent judged, kept in the plugin's own data and never in the instance (spec: "Where
// judgments go"). Per note, the hash of the text judged, so a note changed since shows its
// judgments as judging an earlier version. Pure.
import type { Answer, Gap, Judgment, RunInfo, Scope } from "./agent.ts";

export interface Entry { hash: string; judgments: Judgment[] }
export interface LastRun {
  scope: "note" | "instance";
  path: string | null;
  at: string;
  seconds: number;
  cost: number | null;
  model: string | null;
  program: string;
  denied: string[];
}
export interface Store {
  entries: Record<string, Entry>;
  instance: Judgment[]; // judgments whose path is no entity of the vault
  gaps: Gap[];
  notJudged: string[];
  last: LastRun | null;
}

export const EMPTY: Store = { entries: {}, instance: [], gaps: [], notJudged: [], last: null };

// FNV-1a over the text's UTF-16 units, as hex: enough to tell a changed note from the one judged.
export function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(16)}-${h.toString(16)}`;
}

// A run recorded: a note run replaces its note's entry and its own notJudged, but keeps the
// gaps and the instance's own judgments from the last instance run as they are — they are
// instance-wide findings a note run was never asked to redo. Anything the note run's own answer
// placed under the instance is about a file the run was not asked to judge, so it is dropped, not
// merged in. An instance run replaces every entry, the instance's own judgments and the gaps, and
// gives every entity it was handed an entry, a clean one included, so a clean note reads as judged
// and not as never judged.
export function recordRun(
  store: Store,
  scope: Scope,
  answer: Answer,
  info: RunInfo,
  texts: Map<string, string>,
  meta: { at: string; seconds: number; model: string | null; program: string },
): Store {
  const placed = answer.judgments.filter((j) => j.placed !== "instance");
  const elsewhere = answer.judgments.filter((j) => j.placed === "instance");
  const last: LastRun = {
    scope: scope.kind,
    path: scope.kind === "note" ? scope.path : null,
    at: meta.at,
    seconds: meta.seconds,
    cost: info.cost,
    model: meta.model,
    program: meta.program,
    denied: info.denied,
  };
  if (scope.kind === "note") {
    const text = texts.get(scope.path) ?? "";
    return {
      ...store,
      entries: { ...store.entries, [scope.path]: { hash: hashOf(text), judgments: placed.filter((j) => j.path === scope.path) } },
      notJudged: answer.notJudged,
      last,
    };
  }
  const entries: Record<string, Entry> = {};
  for (const [path, text] of texts) entries[path] = { hash: hashOf(text), judgments: [] };
  for (const j of placed) if (entries[j.path]) entries[j.path].judgments.push(j);
  return { entries, instance: elsewhere, gaps: answer.gaps, notJudged: answer.notJudged, last };
}

export function renamedIn(store: Store, from: string, to: string): Store {
  const entry = store.entries[from];
  if (!entry) return store;
  const entries = { ...store.entries };
  delete entries[from];
  entries[to] = { ...entry, judgments: entry.judgments.map((j) => ({ ...j, path: to })) };
  return { ...store, entries };
}

export function removedFrom(store: Store, path: string): Store {
  if (!store.entries[path]) return store;
  const entries = { ...store.entries };
  delete entries[path];
  return { ...store, entries };
}

// Stale: the note's text is not the text judged, or the note is gone.
export const isStale = (entry: Entry, text: string | null): boolean => text === null || hashOf(text) !== entry.hash;

export function countsOf(store: Store, textOf: (path: string) => string | null): { current: number; stale: number } {
  let current = 0;
  let stale = 0;
  for (const [path, entry] of Object.entries(store.entries)) {
    if (isStale(entry, textOf(path))) stale += entry.judgments.length;
    else current += entry.judgments.length;
  }
  return { current, stale };
}

const isString = (v: unknown): v is string => typeof v === "string";
// A non-null, non-array object: what JSON calls an object, as opposed to `null`, an array, or a
// primitive, none of which are safe to read a field off without a guard first.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPlaced = (v: unknown): v is Judgment["placed"] => v === "line" || v === "loose" || v === "instance";

function judgmentFrom(v: unknown): Judgment | null {
  if (!isObj(v) || !isString(v.path) || typeof v.line !== "number" || !isString(v.type) || !isString(v.rule) || !isString(v.judgment) || !isPlaced(v.placed))
    return null;
  return { path: v.path, line: v.line, type: v.type, rule: v.rule, judgment: v.judgment, placed: v.placed };
}

function entryFrom(v: unknown): Entry | null {
  if (!isObj(v) || !isString(v.hash) || !Array.isArray(v.judgments)) return null;
  const judgments: Judgment[] = [];
  for (const j of v.judgments) {
    const one = judgmentFrom(j);
    if (one) judgments.push(one);
  }
  return { hash: v.hash, judgments };
}

function gapFrom(v: unknown): Gap | null {
  if (!isObj(v) || !isString(v.profile) || !isString(v.role) || !isString(v.skill)) return null;
  return { profile: v.profile, role: v.role, skill: v.skill };
}

function lastFrom(v: unknown): LastRun | null {
  if (!isObj(v) || !isString(v.at)) return null;
  return {
    scope: v.scope === "note" || v.scope === "instance" ? v.scope : "instance",
    path: isString(v.path) ? v.path : null,
    at: v.at,
    seconds: typeof v.seconds === "number" ? v.seconds : 0,
    cost: typeof v.cost === "number" ? v.cost : null,
    model: isString(v.model) ? v.model : null,
    program: isString(v.program) ? v.program : "",
    denied: Array.isArray(v.denied) && v.denied.every(isString) ? v.denied : [],
  };
}

// Saved data read back, trusting nothing: a store, an entry, a judgment, a gap or the last run
// that does not validate is dropped rather than tainting the whole read, down to each item of
// each array; anything left over after that is the empty store.
export function storeFrom(data: unknown): Store {
  if (!isObj(data) || !isObj(data.entries)) return EMPTY;
  const entries: Record<string, Entry> = {};
  for (const [path, raw] of Object.entries(data.entries)) {
    const entry = entryFrom(raw);
    if (entry) entries[path] = entry;
  }
  const instance = Array.isArray(data.instance) ? data.instance.map(judgmentFrom).filter((j): j is Judgment => j !== null) : [];
  const gaps = Array.isArray(data.gaps) ? data.gaps.map(gapFrom).filter((g): g is Gap => g !== null) : [];
  const notJudged = Array.isArray(data.notJudged) ? data.notJudged.filter(isString) : [];
  return { entries, instance, gaps, notJudged, last: lastFrom(data.last) };
}
