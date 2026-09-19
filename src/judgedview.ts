// What the pane lists of the judgments: by file in path order, each file's by line, a file whose
// text changed since as stale, a clean file not at all, and the judgments placed on no entity last,
// under the instance. Pure.
import type { Judgment } from "./agent.ts";
import { isStale } from "./judgments.ts";
import type { Store } from "./judgments.ts";

export interface JudgedGroup { path: string | null; stale: boolean; judgments: Judgment[] }

export function judgedGroups(store: Store, textOf: (path: string) => string | null): JudgedGroup[] {
  const groups: JudgedGroup[] = Object.entries(store.entries)
    .filter(([, entry]) => entry.judgments.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, entry]) => ({
      path,
      stale: isStale(entry, textOf(path)),
      judgments: [...entry.judgments].sort((x, y) => x.line - y.line),
    }));
  if (store.instance.length) groups.push({ path: null, stale: false, judgments: store.instance });
  return groups;
}
