// Bundles the plugin into the main.js Obsidian loads. The meta-model's parser and checks are
// bundled in; Obsidian supplies its own API and CodeMirror at run time, so those stay external.
import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { releaseFiles } from "./scripts/release.mjs";

// The release of the checker this build carries, read from what is installed and not from the
// pin: the guard must compare against the code that actually runs.
const checker = JSON.parse(readFileSync("node_modules/companygraph-meta-model/package.json", "utf8")).version;

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2022",
  outfile: "main.js",
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
  // The release's core and Claude's skills, which "Make this vault an instance" and "Move this
  // vault's core" write: read from what is installed, as the checker's version is.
  define: { __CHECKER_VERSION__: JSON.stringify(checker), __RELEASE__: JSON.stringify(releaseFiles()) },
  // The meta-model's planner hashes with node:crypto, which a phone does not have; the one call
  // it makes is written out in src/sha256.ts, and a test holds that to Node's own.
  alias: { "node:crypto": "./src/sha256.ts" },
  // markdownlint reads files through Node unless told it runs in a browser; the plugin hands it
  // strings and also runs on a phone, so its browser imports are the ones bundled.
  conditions: ["markdownlint-imports-browser"],
  logLevel: "info",
});
