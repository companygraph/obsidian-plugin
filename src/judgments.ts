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

// A run recorded: a note run replaces its note's entry; an instance run replaces every entry,
// the instance's own judgments and the gaps, and gives every entity it was handed an entry, a
// clean one included, so a clean note reads as judged and not as never judged.
export function recordRun(
  store: Store,
  scope: Scope,
  answer: Answer,
  info: RunInfo,
  texts: Map<string, string>,
  meta: { at: string; seconds: number; model: string | null },
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

// Saved data read back, trusting nothing: anything not in the shape is the empty store.
export function storeFrom(data: unknown): Store {
  const d = data as Partial<Store> | null | undefined;
  if (!d || typeof d !== "object" || typeof d.entries !== "object" || d.entries === null || Array.isArray(d.entries)) return EMPTY;
  return {
    entries: d.entries as Record<string, Entry>,
    instance: Array.isArray(d.instance) ? d.instance : [],
    gaps: Array.isArray(d.gaps) ? d.gaps : [],
    notJudged: Array.isArray(d.notJudged) ? d.notJudged : [],
    last: d.last ?? null,
  };
}
