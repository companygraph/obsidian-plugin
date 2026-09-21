// What the installed meta-model release writes into a vault: its core and Claude's skills, each
// as path → text, and the release's own version. esbuild bundles this into main.js, because a
// plugin cannot read node_modules at run time; the tests read it the same way, so what they
// prove is what ships.
import { readdirSync, readFileSync, statSync } from "node:fs";
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

export function releaseFiles(base = ".") {
  const root = join(base, PACKAGE);
  return {
    version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    core: filesUnder(join(root, "core")),
    skills: filesUnder(join(root, "agents/claude/skills")),
  };
}
