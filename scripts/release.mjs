// What the installed meta-model release writes into a vault: its core, its packs and Claude's skills, each
// as path → text, and the release's own version. esbuild bundles this into main.js, because a
// plugin cannot read node_modules at run time; the tests read it the same way, so what they
// prove is what ships.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PACKAGE = "node_modules/companygraph-meta-model";

function filesUnder(root) {
  const files = {};
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, rel)).sort()) {
      const child = rel ? `${rel}/${entry}` : entry;
      if (statSync(join(root, child)).isDirectory()) walk(child);
      else files[child] = readFileSync(join(root, child), "utf8");
    }
  };
  walk("");
  return files;
}

// Each pack the release ships, by name: `packs/<name>/` read as core is.
function packsOf(root) {
  const dir = join(root, "packs");
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).sort().filter((n) => statSync(join(dir, n)).isDirectory()).map((n) => [n, filesUnder(join(dir, n))]));
}

export function releaseFiles(base = ".") {
  const root = join(base, PACKAGE);
  return {
    version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    core: filesUnder(join(root, "core")),
    packs: packsOf(root),
    skills: filesUnder(join(root, "agents/claude/skills")),
  };
}
