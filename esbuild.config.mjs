// Bundles the plugin into the main.js Obsidian loads. The meta-model's parser and checks are
// bundled in; Obsidian supplies its own API and CodeMirror at run time, so those stay external.
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

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
  define: { __CHECKER_VERSION__: JSON.stringify(checker) },
  logLevel: "info",
});
