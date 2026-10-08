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
  readBinary(path: string): Promise<Uint8Array>;
  write(path: string, text: string): Promise<void>;
  writeBinary(path: string, bytes: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  // Takes away a folder that holds nothing; it is only ever asked for one it has just read as empty.
  rmdir(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

// The release this build carries, as scripts/release.mjs reads it.
export interface Release {
  version: string;
  core: Record<string, string>;
  packs: Record<string, Record<string, string>>; // each pack the release ships, by name
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

// The model as `upgradePlan` asks for it: every page under model/ as text, keyed by its path from
// the vault's root, and every other file under model/roles/ as the bytes it is, because those move
// with the folder and are written back exactly as they were. The planner reads no other file
// that is not a page, so an image elsewhere in the model is not loaded into memory.
export async function readModel(disk: Disk): Promise<Map<string, string | Uint8Array>> {
  const model = new Map<string, string | Uint8Array>();
  if (!(await disk.exists("model"))) return model;
  const walk = async (folder: string) => {
    const { files, folders } = await disk.list(folder);
    for (const file of files) {
      if (file.endsWith(".md")) model.set(file, await disk.read(file));
      else if (file.startsWith("model/roles/")) model.set(file, await disk.readBinary(file));
    }
    for (const child of folders) await walk(child);
  };
  await walk("model");
  return model;
}

const asMap = (record: Record<string, string>) => new Map(Object.entries(record));

// A page is written as text and any other file a plan moves as the bytes it is.
export type Writes = Map<string, string | Uint8Array>;

export type Outcome =
  | { refused: string }
  | { writes: Writes; removes: string[]; from?: string; to?: string; edited?: string[]; given?: string[]; rewritten?: string[]; moved?: [string, string][] };

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
  // model/identity.md and model/localization.md are the instance's own and carry no hash, so the
  // manifest never names them; the planner still needs to see them, the same way companygraph's
  // own `upgrade` does, to read model/identity.md's `source` for a fresh localization page and to
  // know whether the instance already has one, rather than take a blank vault for one that simply
  // was not asked for (R18: an upgrade that took silence for absence would overwrite the page a
  // vault already holds with a fresh id every time it moved core).
  for (const path of ["model/identity.md", "model/localization.md"])
    if (await disk.exists(path)) held.set(path, await disk.read(path));
  // The packs the instance took move with its core. One this release does not ship cannot be
  // moved by it, and is refused by name rather than read as foreign files.
  const listed: string[] = Array.isArray(manifest.packs) ? manifest.packs : [];
  const unknown = listed.filter((name) => !Object.hasOwn(release.packs, name));
  if (unknown.length)
    return {
      refused: `This vault takes ${unknown.length === 1 ? "the pack" : "the packs"} ${unknown.join(", ")}, which release ${release.version} does not ship; it ships ${Object.keys(release.packs).join(", ") || "none"}. Take a plugin release that ships ${unknown.length === 1 ? "it" : "them"}, or move the core with the command line.`,
    };
  const plan = upgradePlan({
    core: asMap(release.core),
    packs: new Map(listed.map((name) => [name, asMap(release.packs[name])])),
    skills: asMap(release.skills),
    tooling: release.version,
    tag: `v${release.version}`,
    manifest,
    held,
    workflow: (await disk.exists(WORKFLOW)) ? await disk.read(WORKFLOW) : null,
    force,
    // pins.json is the vault's own once it exists, and the plan writes one only where there is
    // none; whether it is there is all the plan asks, as companygraph's own `upgrade` tells it.
    present: new Set((await disk.exists("pins.json")) ? ["pins.json"] : []),
    model: await readModel(disk),
  });
  if (!("writes" in plan)) return { refused: plan.refused };
  return { writes: plan.writes, removes: plan.removes, from: plan.from, to: plan.to, edited: plan.edited, given: plan.given, rewritten: plan.rewritten, moved: plan.moved };
}

// Paths a plan writes, gathered by folder so a list of fifty files reads in a line or two:
// `meta/core (22)`, `.claude/skills (6)`, and a file alone in its group by its whole path,
// `.companygraph/manifest.json`, `AGENTS.md`.
export function summary(paths: string[]): string {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const parts = path.split("/");
    const key = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : path;
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  return [...groups].map(([key, held]) => (held.length > 1 ? `${key} (${held.length})` : held[0])).join(", ");
}

// The folder a moved file leaves and the one it arrives in, two segments deep, as a vault owner
// names them: model/roles/reviewer.md moved to model/seats/reviewer.md is model/roles/ to model/seats/.
const folderOf = (path: string) => `${path.split("/").slice(0, 2).join("/")}/`;

// The moves a plan makes, gathered by the folders they run between: `model/roles/ to model/seats/ (3)`.
export function movedSummary(moved: [string, string][]): string {
  const groups = new Map<string, number>();
  for (const [from, to] of moved) {
    const key = `${folderOf(from)} to ${folderOf(to)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([key, count]) => `${key} (${count})`).join(", ");
}

// The folders a plan moves files between, each pair once: [["model/roles/", "model/seats/"]].
const folderPairs = (moved: [string, string][]) =>
  [...new Set(moved.map(([from, to]) => `${folderOf(from)}\t${folderOf(to)}`))].map((pair) => pair.split("\t") as [string, string]);

// What a move touches beyond its own files, said from the plan rather than assumed: the files it
// moves from one folder to another, the files it writes into the model that no other list names
// (a README for the folder the files arrive in, where the old folder had none), the files it gives
// a vault that has none of them, the pages it rewrites into the form the new core reads, and
// whether the model is left as it is. Where the plan does none of those, the model is not touched.
export function moveScope(plan: { to?: string; given?: string[]; rewritten?: string[]; moved?: [string, string][]; writes?: Map<string, unknown> }): string {
  const given = plan.given ?? [];
  const rewritten = plan.rewritten ?? [];
  const moved = plan.moved ?? [];
  const arrivals = new Set(moved.map(([, to]) => to));
  const fresh = [...(plan.writes?.keys() ?? [])].filter((path) => path.startsWith("model/") && !arrivals.has(path) && !given.includes(path) && !rewritten.includes(path));
  const are = (paths: string[]) => (paths.length === 1 ? "is" : "are");
  const said = [
    moved.length
      ? "The vendored core, the skills the tooling installed, the manifest and the workflow's tag move."
      : "Only the vendored core, the skills the tooling installed, the manifest and the workflow's tag move.",
  ];
  for (const [from, to] of folderPairs(moved))
    said.push(`The files in ${from} move to ${to}, each page keeping its id, and ${from} goes to the trash once it is empty.`);
  // The folder's README moves with the rest and its heading, folder and schema path are changed to
  // the new names; the plan lists it among the rewritten pages, and it is said here instead.
  const readmes = moved.map(([, to]) => to).filter((to) => /^model\/[^/]+\/README\.md$/.test(to) && rewritten.includes(to));
  const rewrittenPages = rewritten.filter((path) => !readmes.includes(path));
  for (const readme of readmes)
    said.push(`${readme} has its heading, folder and schema path changed to the new names; what its prose says about roles is yours to edit.`);
  // A move can rewrite every page of a kind, so past three paths they are said by folder.
  const named = (paths: string[]) => (paths.length > 3 ? summary(paths) : paths.join(", "));
  if (fresh.length) said.push(`${named(fresh)} ${are(fresh)} written.`);
  if (given.length) said.push(`${named(given)} ${are(given)} written, as the vault has none yet.`);
  if (rewrittenPages.length) said.push(`${named(rewrittenPages)} ${are(rewrittenPages)} rewritten into the form core ${plan.to} reads.`);
  const inModel = [...fresh, ...given, ...rewritten, ...moved.flat()].some((path) => path.startsWith("model/"));
  said.push(inModel ? "Nothing else in the model is touched." : "The model is not touched.");
  if (moved.some(([, to]) => to.startsWith("model/seats/")))
    said.push(
      "Files of your own that still say roles, such as README.md, AGENTS.md, pages in the model that link into roles/ and an export guide's {{count:Roles}}, " +
        "are yours to edit; nothing here rewrites them, and the command line's upgrade lists them when it makes this move.",
    );
  return said.join(" ");
}

// What the press reports once a move is carried out. A moved file is counted as moved and as
// neither written nor removed, since it is both and one count should not say it twice.
export function doneSaid(plan: { from?: string; to?: string; writes: Map<string, unknown>; removes: string[]; moved?: [string, string][] }): string {
  const moves = plan.moved ?? [];
  return (
    `Core ${plan.from} → ${plan.to}: ${plan.writes.size - moves.length} written, ${plan.removes.length - moves.length} removed` +
    (moves.length ? `, ${moves.length} moved: ${movedSummary(moves)}` : "")
  );
}

// The hint after a refusal. Only a refusal that mentions --force is one that --force changes; the
// seat refusals (pages in both folders, both keys on one page) are the owner's to settle by hand.
export function forceHint(refused: string, version: string): string | null {
  return refused.includes("--force") ? `From a terminal, npx github:companygraph/meta-model#v${version} upgrade --force overwrites them.` : null;
}

// What a carry-out had done when it stopped, and what the owner may do about it. The writes come
// first and the removals after, so a stop with nothing removed leaves only copies behind.
export interface Progress {
  written: string[];
  removed: string[];
}

export function stoppedSaid(progress: Progress, total: number, moved: [string, string][], message: string): string {
  const said = [`The move stopped partway: ${message}. ${progress.written.length} of ${total} files written.`];
  const pairs = folderPairs(moved);
  if (pairs.length) {
    const to = pairs.map(([, t]) => t).join(" and ");
    const from = pairs.map(([f]) => f).join(" and ");
    said.push(
      progress.removed.length === 0
        ? `Nothing was removed; the copies in ${to} can be removed to try again.`
        : `${progress.removed.length} removed already; look in ${from} and ${to} before trying again.`,
    );
  }
  return said.join(" ");
}

// A plan, carried out: every folder a write needs made first, then the writes, a page as text and
// any other file as its bytes, then the removals. A folder under model/ that a removal left empty
// is taken away too, and only such a folder, and never model/ itself: an empty folder is a place
// the next reader has to wonder about.
export async function carryOut(disk: Disk, writes: Writes, removes: string[], progress: Progress = { written: [], removed: [] }): Promise<void> {
  const made = new Set<string>();
  for (const [path, content] of writes) {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (made.has(folder)) continue;
      if (!(await disk.exists(folder))) await disk.mkdir(folder);
      made.add(folder);
    }
    if (typeof content === "string") await disk.write(path, content);
    else await disk.writeBinary(path, content);
    progress.written.push(path);
  }
  for (const path of removes)
    if (await disk.exists(path)) {
      await disk.remove(path);
      progress.removed.push(path);
    }
  const emptied = new Set<string>();
  for (const path of removes.filter((p) => p.startsWith("model/")))
    for (let dir = path.split("/").slice(0, -1).join("/"); dir.startsWith("model/"); dir = dir.split("/").slice(0, -1).join("/")) {
      if (emptied.has(dir)) break;
      if (!(await disk.exists(dir))) continue;
      const left = await disk.list(dir);
      if (left.files.length || left.folders.length) break;
      await disk.rmdir(dir);
      emptied.add(dir);
    }
}
