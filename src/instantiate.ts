// Making the open vault an instance, and moving its core: the meta-model's own `init` and
// `upgrade`, called rather than rewritten. Its planner decides every file; this module reads what
// the planner needs from the vault, hands it the release the plugin bundles, and carries out the
// plan it returns. The disk is an interface so all of it is tested without Obsidian.
import { initPlan, upgradePlan, SKILLS } from "companygraph-meta-model/plan";
import { TYPES } from "companygraph-meta-model/checks";

// The few calls made on Obsidian's DataAdapter: paths relative to the vault, dot-folders included.
export interface Disk {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

// The release this build carries, as scripts/release.mjs reads it.
export interface Release {
  version: string;
  core: Record<string, string>;
  skills: Record<string, string>;
}

export const MANIFEST = ".companygraph/manifest.json";
export const WORKFLOW = ".github/workflows/companygraph.yml";

// Folders no plan writes into and nothing here needs to see: Obsidian's own settings, its bin,
// and git's store.
const SKIPPED = new Set([".obsidian", ".trash", ".git"]);

// The folders `init` can write, for the choice it offers: one per type with a folder of its own,
// as `init` itself lists them. A test holds this to what `init` writes when given no choice.
export const folderChoices = (): string[] =>
  [...new Set(TYPES.filter((t) => t.folder && !t.owner).map((t) => t.folder!.split("/")[0]))].sort();

// Every file in the vault, for the plan's check that it writes over nothing.
export async function present(disk: Disk): Promise<Set<string>> {
  const found = new Set<string>();
  const walk = async (folder: string) => {
    const { files, folders } = await disk.list(folder);
    for (const file of files) found.add(file);
    for (const child of folders) if (!SKIPPED.has(child.split("/").at(-1)!)) await walk(child);
  };
  await walk("");
  return found;
}

const asMap = (record: Record<string, string>) => new Map(Object.entries(record));

export type Outcome =
  | { refused: string }
  | { writes: Map<string, string>; removes: string[]; from?: string; to?: string; edited?: string[] };

export async function planInstance(
  disk: Disk,
  release: Release,
  ask: { name: string; folders?: string[] },
): Promise<Outcome> {
  if (await disk.exists(MANIFEST)) return { refused: "This vault is an instance already; move its core instead." };
  const plan = initPlan({
    core: asMap(release.core),
    skills: asMap(release.skills),
    tooling: release.version,
    tag: `v${release.version}`,
    name: ask.name,
    agent: "claude",
    folders: ask.folders,
    present: await present(disk),
  });
  return plan.writes === undefined ? { refused: plan.refused } : { writes: plan.writes, removes: [] };
}

export async function planMove(disk: Disk, release: Release, force = false): Promise<Outcome> {
  if (!(await disk.exists(MANIFEST))) return { refused: "This vault is not an instance yet; make it one first." };
  let manifest;
  try {
    manifest = JSON.parse(await disk.read(MANIFEST));
  } catch (error) {
    return { refused: `${MANIFEST} does not parse: ${error instanceof Error ? error.message : String(error)}` };
  }
  // What the manifest names, and the skills this release would write, read where they exist, so
  // the planner can tell a file the tooling wrote from one the vault wrote under the same name.
  const held = new Map<string, string>();
  const wanted = [...Object.keys(manifest.files ?? {}), ...Object.keys(release.skills).map((p) => `${SKILLS}${p}`)];
  for (const path of wanted)
    if (!held.has(path) && (await disk.exists(path))) held.set(path, await disk.read(path));
  const plan = upgradePlan({
    core: asMap(release.core),
    skills: asMap(release.skills),
    tooling: release.version,
    tag: `v${release.version}`,
    manifest,
    held,
    workflow: (await disk.exists(WORKFLOW)) ? await disk.read(WORKFLOW) : null,
    force,
  });
  if (!("writes" in plan)) return { refused: plan.refused };
  return { writes: plan.writes, removes: plan.removes, from: plan.from, to: plan.to, edited: plan.edited };
}

// A plan, carried out: every folder a write needs made first, then the writes, then the removals.
export async function carryOut(disk: Disk, writes: Map<string, string>, removes: string[]): Promise<void> {
  const made = new Set<string>();
  for (const [path, text] of writes) {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (made.has(folder)) continue;
      if (!(await disk.exists(folder))) await disk.mkdir(folder);
      made.add(folder);
    }
    await disk.write(path, text);
  }
  for (const path of removes) if (await disk.exists(path)) await disk.remove(path);
}
