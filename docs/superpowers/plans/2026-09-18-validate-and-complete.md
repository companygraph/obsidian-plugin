# Validate and complete — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version one of the CompanyGraph Obsidian plugin: the meta-model's checks over the whole vault on every change, shown in a pane, on the open file's lines and in the status bar, and completion for what the schemas declare.

**Architecture:** Six pure TypeScript modules decide everything and are tested under Node against two fetched fixtures; five thin Obsidian-facing modules read the vault and show results. The parser and the checks are `companygraph-meta-model` at a pinned tag, bundled by esbuild; the schemas are read from the vault's own vendored core. Two readers completion needs are exported upstream first, in a minor release of the meta-model.

**Tech Stack:** TypeScript run by Node's own type stripping (Node 24 or newer, no test dependency), esbuild, the `obsidian` type package with the CodeMirror 6 packages it brings as peers, `companygraph-meta-model` from a GitHub tag.

**Spec:** `docs/superpowers/specs/2026-09-18-obsidian-plugin-design.md`. Executors read it before Task 1.

**Proven before this plan was written:** every pure module and every test below ran green in a throwaway prototype against the meta-model's example and the reference instance, the Obsidian-facing modules typechecked, and the bundle built. What no prototype could prove is behavior inside Obsidian; Task 10 is where that is found out.

**After review, 2026-09-18.** The task reviews and the whole-branch review overruled code in this plan's blocks for Tasks 4, 5, 6, 8 and 9: the locator's matching, the context reader's table and fence reading, what is offered when a name is already complete, the rebuild's error boundary and its guard against an older rebuild winning, and several decisions that moved out of the Obsidian-facing modules into tested ones. The blocks below stay as the record of what was first built. **The repository is what to read.**

## Global Constraints

- No second implementation of a rule. The parser, the checks, `slug`, table reading, the reader of a Type cell and the reader of an enum's values come from `companygraph-meta-model`. A rule the package does not export is proposed upstream, never written here.
- A reference is inserted as the plain canonical name. No `[[wikilinks]]`, no `aliases` field.
- The schemas are read from the vault's vendored core, `<units>/core/`, never from the bundled package.
- The plugin calls no model and starts no agent.
- `isDesktopOnly` is false: no module under `src/` imports from `node:`. Tests and scripts may.
- Type stripping is the test runner: no enums, no parameter properties, no namespaces; a relative import names its file with `.ts`; a type is imported with `import type`.
- Do not install `@codemirror/state` or `@codemirror/view` by name. `obsidian` pins exact versions of both as peers and npm installs those; naming them asks for the latest and the install fails to resolve.
- `companygraph-meta-model` is installed by name whenever its pin moves, `npm install companygraph-meta-model@github:companygraph/meta-model#<tag>`, so the lockfile moves with it. `test/pin.test.ts` holds that.
- The family's conventions apply, `conventions/WRITING.md` and `conventions/WORKING.md`: American English, the prose register in Markdown, the git register in commits (a sentence as subject, one to three paragraphs, a closing `Verified:` line, then trailers), a merge commit and never a squash, and **merging is the owner's decision: open the pull request, report the check, stop.**
- A count or a version of something that still moves is not written into prose. Say where it is read.
- Plugin id `companygraph`, display name `CompanyGraph`, license Apache 2.0, README title `# CompanyGraph — Obsidian Plugin`.

## File structure

```
manifest.json            Obsidian's plugin manifest: id, name, version, minAppVersion
package.json             the meta-model pin, the scripts
tsconfig.json            typecheck only; nothing is emitted by tsc
esbuild.config.mjs       bundles src/main.ts into main.js, defines the bundled checker's release
styles.css               the mark on a line, the pane
scripts/fixtures.mjs     fetches the two fixtures into test/fixtures/
src/
  meta-model.d.ts        types for the untyped package
  manifest.ts            pure: the instance's manifest, the two guards
  model.ts               pure: a file map in; failures, skipped, the parsed graph, the schemas out
  locate.ts              pure: a failure string to a file and a line
  context.ts             pure: lines and a cursor to a completion context
  vocabulary.ts          pure: schemas to what each type declares
  candidates.ts          pure: a context to what is offered
  vault.ts               Obsidian: the vault to the file map
  marks.ts               CodeMirror: marks on the open file's lines
  pane.ts                Obsidian: the report
  suggest.ts             Obsidian: the completion popup
  main.ts                Obsidian: when to rebuild, where a rebuild shows
test/
  helpers.ts             the fixtures as maps
  *.test.ts              one per pure module, and the pin test
```

Task 1 is committed on `main` of the local repository, which is how a repository gets its first commits before a ruleset exists. Tasks 3 to 9 are one branch, `validate-and-complete`, one commit per task, one pull request at the end (Task 11). Task 2 is a pull request in another repository.

---

### Task 1: The repository, a member of the family

**Files:**

- Create: `package.json`, `manifest.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `LICENSE`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `conventions.json`, `conventions/` (by sync), `.github/workflows/conventions.yml`, `.github/workflows/test.yml`, `scripts/fixtures.mjs`, `src/main.ts`, `src/meta-model.d.ts`, `test/helpers.ts`, `test/pin.test.ts`

**Interfaces:**

- Produces: `npm test`, `npm run typecheck`, `npm run build`; `test/helpers.ts` exporting `EXAMPLE`, `example()`, `REFERENCE`, `reference()`, `referenceManifest()`, `edited(files, file, change)`; the ambient module types in `src/meta-model.d.ts`.

Work in `~/git/companygraph/obsidian-plugin`, which exists with one commit, the spec. Run `git config user.email` first and read the answer: it must be the owner's address, which the `includeIf` for `~/git/companygraph/` supplies.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "companygraph-obsidian-plugin",
  "version": "0.1.0",
  "private": true,
  "description": "CompanyGraph in Obsidian: checks an instance as it is edited and completes what its schemas declare",
  "license": "Apache-2.0",
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "fixtures": "node scripts/fixtures.mjs",
    "pretest": "node scripts/fixtures.mjs",
    "test": "node --test 'test/*.test.ts'",
    "typecheck": "tsc --noEmit",
    "build": "node esbuild.config.mjs"
  }
}
```

- [ ] **Step 2: Install, the meta-model by name and the rest as development dependencies**

```sh
export PATH=/opt/homebrew/bin:$PATH
TAG=$(gh release view --repo companygraph/meta-model --json tagName --jq .tagName)
npm install "companygraph-meta-model@github:companygraph/meta-model#$TAG"
npm install --save-dev obsidian esbuild typescript @types/node
ls node_modules/@codemirror
```

Expected: the last line prints `state` and `view`, brought by `obsidian` as peers. `package.json` now carries `"companygraph-meta-model": "github:companygraph/meta-model#vX.Y.Z"` with the tag that was read.

- [ ] **Step 3: Write `manifest.json`, Obsidian's**

```json
{
  "id": "companygraph",
  "name": "CompanyGraph",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Checks a CompanyGraph instance as it is edited and completes what its schemas declare.",
  "author": "Robert Blust",
  "authorUrl": "https://blust.ch",
  "isDesktopOnly": false
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Write `esbuild.config.mjs`**

```js
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
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
test/fixtures/
main.js
.superpowers/
```

`main.js` is built and attached to a release; it is never committed.

- [ ] **Step 7: Write `scripts/fixtures.mjs`**

```js
// Fetches the two repositories the suite runs against into test/fixtures/: companygraph/
// meta-model at the tag package.json pins, for its worked example and core/, and the reference
// instance robertblust/mental-model at one commit, for an instance in the layout every real one
// has. Neither is in node_modules: the package ships lib/ and bin/ only, and an instance is
// content, not a dependency.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const [, metaRepo, tag] = pkg.dependencies["companygraph-meta-model"].match(/^github:([^#]+)#(.+)$/);

// The instance commit is test data and lives here.
const INSTANCE_COMMIT = "5040f08c3473a67b9ed268bfcd26915016b0e36e";

const FIXTURES = [
  { repo: metaRepo, ref: tag, url: `https://codeload.github.com/${metaRepo}/tar.gz/refs/tags/${tag}`, dir: "meta-model" },
  { repo: "robertblust/mental-model", ref: INSTANCE_COMMIT, url: `https://codeload.github.com/robertblust/mental-model/tar.gz/${INSTANCE_COMMIT}`, dir: "mental-model" },
];

for (const f of FIXTURES) {
  const target = path.join(root, "test", "fixtures", f.dir);
  const marker = path.join(target, ".ref");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === f.ref) {
    console.log(`fixtures: ${f.repo}@${f.ref.slice(0, 12)} already present`);
    continue;
  }
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  execFileSync("tar", ["-xz", "--strip-components=1", "-C", target], { input: Buffer.from(await res.arrayBuffer()) });
  fs.writeFileSync(marker, f.ref + "\n");
  console.log(`fixtures: ${f.repo}@${f.ref.slice(0, 12)} fetched into test/fixtures/${f.dir}`);
}
```

- [ ] **Step 8: Write `src/meta-model.d.ts`**

Only what the pinned release exports. Task 7 adds the two readers once a release exports them.

```ts
// companygraph-meta-model ships JavaScript and no types. These are the exports this plugin
// uses, as lib/checks.mjs and lib/instance.mjs define them.
declare module "companygraph-meta-model/checks" {
  export function checkInstance(
    files: Map<string, string>,
    options?: { core?: string; model?: string },
  ): { failures: string[]; skipped: string[] };
  export function typeOfPath(rel: string, model: string): string | null;
  export function isNewer(a: string, b: string): boolean;
  export const COLUMN_CAPTION: RegExp;
}

declare module "companygraph-meta-model/instance" {
  export interface Table { caption: string | null; columns: string[]; rows: string[][] }
  export interface Section { heading: string; text: string; tables: Table[]; table?: Table }
  export interface Entity {
    id: string; type: string; name: string; tagline: string;
    fields: Record<string, string | string[]>;
    sections: Section[]; owner: string | null; path: string;
  }
  export interface Graph { entities: Entity[]; edges: unknown[]; types: unknown[]; root: string; rootId: string | null }
  export function parseInstance(files: Map<string, string>, options: { sub?: string; schemas: Map<string, string> }): Graph;
  export function parseSchemas(files: Map<string, string>, options?: { sub?: string }): Graph;
}
```

- [ ] **Step 9: Write the stub `src/main.ts`**

```ts
// The plugin's entry. It does nothing yet: the skeleton proves the toolchain, and the wiring
// arrives once the pure modules exist.
import { Plugin } from "obsidian";

export default class CompanyGraphPlugin extends Plugin {
  async onload() {}
}
```

- [ ] **Step 10: Write `test/helpers.ts`**

```ts
// The two fixtures as the maps the plugin builds from a vault: path → text, keyed from the
// fixture's root. scripts/fixtures.mjs fetches them; `npm test` runs it first.
import fs from "node:fs";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

function readTree(root: string, folders: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(root, rel))) {
      const child = `${rel}/${entry}`;
      if (fs.statSync(path.join(root, child)).isDirectory()) walk(child);
      else files.set(child, fs.readFileSync(path.join(root, child), "utf8"));
    }
  };
  folders.forEach(walk);
  return files;
}

// Where a fixture keeps its schemas and its container: the shape src/model.ts calls a Layout.
// The meta-model's worked example: a valid instance, core at the repository root.
export const EXAMPLE = { core: "core", model: "example/model" };
export const example = () => readTree(path.join(FIXTURES, "meta-model"), [EXAMPLE.model, EXAMPLE.core]);

// The reference instance: the layout every real instance has.
export const REFERENCE = { core: "meta/core", model: "model" };
export const reference = () => readTree(path.join(FIXTURES, "mental-model"), [REFERENCE.model, REFERENCE.core]);
export const referenceManifest = () =>
  fs.readFileSync(path.join(FIXTURES, "mental-model", ".companygraph", "manifest.json"), "utf8");

// One edit to one file of a map, returned as a new map.
export function edited(files: Map<string, string>, file: string, change: (text: string) => string) {
  const next = new Map(files);
  if (!next.has(file)) throw new Error(`${file} is not in the fixture`);
  next.set(file, change(next.get(file)!));
  return next;
}
```

`EXAMPLE` and `REFERENCE` are plain objects of the shape Task 4 names `Layout`; nothing is imported from `src/`, so this file typechecks before any module exists.

- [ ] **Step 11: Write `test/pin.test.ts`**

```ts
// A stale lockfile builds green on an older release than the pin names. It has happened three
// times in this family, so the installed package is held to the pin on every run.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

test("the installed meta-model is the release package.json pins", () => {
  const pin = read("package.json").dependencies["companygraph-meta-model"];
  const tag = pin.match(/^github:companygraph\/meta-model#v(\d+\.\d+\.\d+)$/)?.[1];
  assert.ok(tag, `the pin "${pin}" is not github:companygraph/meta-model#vX.Y.Z`);
  const installed = read("node_modules/companygraph-meta-model/package.json").version;
  assert.equal(installed, tag, "install the package by name so the lockfile moves with the pin");
});

test("the plugin's manifest and package.json carry one version", () => {
  assert.equal(read("manifest.json").version, read("package.json").version);
});
```

- [ ] **Step 12: Run the tests**

Run: `npm test` Expected: the fixtures script prints two `fetched into test/fixtures/` lines, then 2 tests pass.

- [ ] **Step 13: Build, and typecheck what exists**

Run: `npm run build && ls -la main.js` Expected: esbuild prints `main.js` with its size and `Done`.

Run: `npm run typecheck` Expected: no output, exit 0.

- [ ] **Step 14: Vendor the conventions**

```sh
TAG=$(gh release view --repo robertblust/conventions --json tagName --jq .tagName)
printf '{ "repo": "robertblust/conventions", "tag": "%s", "exclude": [".superpowers", "docs/superpowers", "node_modules", "test/fixtures"] }\n' "$TAG" > conventions.json
mkdir -p conventions
cp ~/git/robertblust/conventions/conventions/conventions-sync conventions/conventions-sync
```

Then write `AGENTS.md` with this repository's own part (the sync puts the shared block above it):

```markdown
# AGENTS.md

Guidance for agents working in this repository. The design is
`docs/superpowers/specs/2026-09-18-obsidian-plugin-design.md`; read it before anything else.

## What this is

An Obsidian plugin that checks a CompanyGraph instance as it is edited and completes what its
schemas declare. It runs the parser and the checks of `companygraph/meta-model`, bundled at the
release `package.json` pins, over the vault, and reads the schemas from the core the vault
vendored.

## No rule is implemented here

**A rule the plugin needs that the package does not export is proposed to the meta-model and
never written here.** The family keeps one definition of the slug, of table reading, of how a
Type cell and an enum's values are read, and a second copy in a plugin is the drift that rule
exists to prevent. The one admitted exception is `src/locate.ts`, which reads a failure's
message to find its file and line; it stands only until the checks return a structure, and is
deleted on that day.

## Layout

Everything that decides anything is a pure module under `src/`, with a test beside it under
`test/`: `manifest.ts`, `model.ts`, `locate.ts`, `context.ts`, `vocabulary.ts`, `candidates.ts`.
The modules that touch Obsidian, `vault.ts`, `marks.ts`, `pane.ts`, `suggest.ts` and `main.ts`,
are kept thin because nothing here can run them; they are proven by hand on the reference
instance. No module under `src/` imports from `node:`, because the plugin also runs on a phone.

The tests run under Node's own type stripping, so a source file uses only syntax that erases: no
enum, no parameter property, no namespace, a relative import named with its `.ts`, a type
imported with `import type`.

## Checks

`npm run typecheck`, `npm test` and `npm run build`. Two jobs are required on `main`: `test`,
which runs those three, and `conventions / conventions`, called from robertblust/conventions at
the pinned tag. `npm test` fetches its two fixtures first, the meta-model at the pinned tag and
the reference instance at the commit `scripts/fixtures.mjs` names.

## The pin

`companygraph-meta-model` is pinned by tag in `package.json`, and the pin is editorial: it moves
in a commit that says why. Move it by installing the package by name,
`npm install companygraph-meta-model@github:companygraph/meta-model#<tag>`, never by editing the
line, because an edited line leaves the lockfile on the old release and everything still builds.
`test/pin.test.ts` fails when the two disagree. Do not install `@codemirror/state` or
`@codemirror/view` by name: `obsidian` pins exact versions of both as peers.
```

Write `CLAUDE.md`:

```
@AGENTS.md
@conventions/WRITING.md
@conventions/WORKING.md
@conventions/REPOSITORIES.md
```

Then sync and check:

```sh
sh conventions/conventions-sync sync
sh conventions/conventions-sync check
```

Expected: `✓ conventions: conventions/ and the AGENTS.md block are at robertblust/conventions@<tag>`, then a clean check. `AGENTS.md` now opens with the `<!-- conventions · … -->` block.

- [ ] **Step 15: Write `LICENSE` and `README.md`**

```sh
cp ~/git/companygraph/mcp-server/LICENSE LICENSE
```

`README.md`:

```markdown
# CompanyGraph — Obsidian Plugin

An Obsidian plugin that checks a CompanyGraph instance as it is edited and completes what its
schemas declare. An instance is a folder of Markdown files with YAML frontmatter, which is also
what an Obsidian vault is, so an instance opens as a vault with no change to any file. What a
vault lacks is what the instance's CI supplies after the edit: an unresolvable reference is an
error, and so is a field the schema does not declare. The plugin says so while the edit is made.

It implements no rule of its own. The parser and the checks are those of
`companygraph/meta-model`, bundled at the release `package.json` pins, and the schemas are read
from the core the vault vendored, so an instance is held to the release it adopted and to no
other. The writing rules in each schema are not checked here or by anything mechanical, and
every report ends by saying so.

## What it does

A vault with a `.companygraph/manifest.json` is an instance; in any other vault the plugin stays
idle. In an instance it checks the whole model on every change, because a reference crosses
files, and shows the result in three places: a pane that lists the failures by file and then
what was not checked, a mark on the line of each failure in the open file, and a count in the
status bar.

While typing it offers what the file's schema declares: the frontmatter fields the file lacks,
the permitted values of an enum, the canonical names of the type a reference declares, the same
by column in a table section, and the sections the file lacks. A name is inserted plain, as the
conventions write a reference; the plugin resolves it and Obsidian's own graph view does not see
it. Completion works in Source mode and with properties shown as source; the spec's open
questions say what is known about Live Preview.

## Installing it

Copy `main.js`, `manifest.json` and `styles.css` from a release into
`.obsidian/plugins/companygraph/` in the vault and enable CompanyGraph under community plugins,
or point BRAT at this repository. An instance that is a git repository keeps `.obsidian/` in its
`.gitignore`.

## Working on it

`npm install`, then `npm test`, `npm run typecheck` and `npm run build`. The design, with every
decision and its reason, is in `docs/superpowers/specs/`.

## License

[Apache 2.0](LICENSE).
```

- [ ] **Step 16: Write the two workflows**

`.github/workflows/conventions.yml`, with the tag `conventions.json` names on the last line:

```yaml
name: conventions
on:
  push:
    branches: [main]
  pull_request:
jobs:
  conventions:
    uses: robertblust/conventions/.github/workflows/check.yml@<the tag in conventions.json>
```

`.github/workflows/test.yml`:

```yaml
name: test
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

Replace `<the tag in conventions.json>` with the tag itself, `sed -n 's/.*"tag": "\([^"]*\)".*/\1/p' conventions.json` prints it.

- [ ] **Step 17: Run the prose check and commit**

Run: `sh conventions/conventions-check` Expected: `✓ every Markdown file follows WRITING.md`.

```sh
git add -A
git commit -F - <<'EOF'
The repository is a member of the family and builds

The toolchain is in place before any behavior: the meta-model installed by name at its
release, a pin test that holds the lockfile to the pin, the two fixtures fetched the way
the MCP server fetches them, a typecheck, and a bundle of an entry that does nothing yet.
The conventions are vendored at their release and both workflows are written.

Verified: npm test and npm run typecheck pass, npm run build writes main.js,
conventions-sync check and conventions-check pass.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 18: Create the repository on GitHub. Outward-facing: the owner's go is needed in the session that runs it**

```sh
gh repo create companygraph/obsidian-plugin --public --source . --push \
  --description "CompanyGraph in Obsidian: checks an instance as it is edited and completes what its schemas declare"
```

The ruleset is added in Task 11, after the first pull request has produced the two check names it requires; a ruleset that requires a check no run has reported blocks every merge.

---

### Task 2: Upstream, the two readers exported (in `companygraph/meta-model`)

**Files (in `~/git/companygraph/meta-model`):**

- Modify: `lib/instance.mjs` (the line `function declarationOf(cell) {`)
- Modify: `lib/checks.mjs` (the line `function enumTokensOf(description) {`)
- Modify: `verify/instance.test.mjs:6`, `verify/instance-checks.test.mjs:11`, and one test appended to each
- Modify: `README.md`, the paragraph on `lib/`
- Modify: `package.json` version, a minor

**Interfaces:**

- Produces: `declarationOf(cell: string | undefined): { form: "ref" | "ref?" | "qualifier", target: string } | null` from `companygraph-meta-model/instance`; `enumTokensOf(description: string): string[]` from `companygraph-meta-model/checks`.

Read `AGENTS.md` of that repository first; its rules govern this task, this plan does not.

- [ ] **Step 1: Branch**

```sh
cd ~/git/companygraph/meta-model && git switch main && git pull && git switch -c export-the-two-readers
```

- [ ] **Step 2: Write the failing tests**

In `verify/instance.test.mjs`, line 6 becomes:

```js
import { parseInstance, parseSchemas, declarationOf, CORE_LABEL } from "../lib/instance.mjs";
```

and append:

```js
// Exported for a consumer that offers what a schema declares — an editor's completion — so that
// it reads a Type cell through the one reader and never through a copy of DECLARATION.
test("declarationOf is the one reader of a Type cell, and a consumer may call it", () => {
  assert.deepEqual(declarationOf("ref → source"), { form: "ref", target: "source" });
  assert.deepEqual(declarationOf("`array of ref → role`"), { form: "ref", target: "role" });
  assert.deepEqual(declarationOf("ref? → identity"), { form: "ref?", target: "identity" });
  assert.deepEqual(declarationOf("qualifier → proficiency-level"), { form: "qualifier", target: "proficiency-level" });
  assert.equal(declarationOf("string"), null);
  assert.equal(declarationOf(undefined), null);
});
```

In `verify/instance-checks.test.mjs`, line 11 becomes:

```js
import { blocksOf, checkInstance, enumTokensOf, isNewer } from "../lib/checks.mjs";
```

and append:

```js
// Exported for the same consumer: the values an enum permits are read from its Description by
// this function in the R8 check, and an editor that offered a list read any other way would
// offer a value the check then refuses.
test("enumTokensOf reads the run of backticked values a Description opens with", () => {
  assert.deepEqual(enumTokensOf("`human` or `agent`. What holds this profile."), ["human", "agent"]);
  assert.deepEqual(enumTokensOf("`a`, `b`, or `c`"), ["a", "b", "c"]);
  assert.deepEqual(enumTokensOf("One of several kinds."), []);
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npm run test:instance; npm run test:instance-checks` Expected: both fail at import, `does not provide an export named 'declarationOf'` and `'enumTokensOf'`.

- [ ] **Step 4: Export the two**

`lib/instance.mjs`: `function declarationOf(cell) {` becomes `export function declarationOf(cell) {`. `lib/checks.mjs`: `function enumTokensOf(description) {` becomes `export function enumTokensOf(description) {`.

- [ ] **Step 5: Run every suite**

Run: `npm run verify && npm run test:instance && npm run test:instance-checks && npm run test:rules` Expected: all pass.

- [ ] **Step 6: Say so in the README and move the version**

In `README.md`, after the sentence that ends "and `parseSchemas` turns that second map into the graph of the vocabulary itself.", add:

```markdown
A consumer that offers what a schema declares rather than checking it, an editor's completion,
reads a Type cell with `declarationOf` from the same module and an enum's permitted values with
`enumTokensOf` from `companygraph-meta-model/checks`; both are the one reader the parser and the
checks use themselves.
```

In `package.json`, raise the minor of `version` by one and set the patch to zero. `core/manifest.json` does not move: no schema changed, and the instance-checks spec says the two numbers part on exactly this kind of release.

- [ ] **Step 7: Commit, push, open the pull request, stop**

```sh
git add -A
git commit -F - <<'EOF'
The reader of a Type cell and of an enum's values are exported

The Obsidian plugin completes what a schema declares, so it has to know that a field is a
reference to a type and which values an enum permits. The package has one reader of each,
and neither was exported, which left a consumer the choice of copying a pattern or not
offering the value. Both are now exports; nothing about how they read changed.

Verified: npm run verify, test:instance, test:instance-checks and test:rules pass.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git push -u origin export-the-two-readers
gh pr create --title "The reader of a Type cell and of an enum's values are exported" --body-file - <<'EOF'
The Obsidian plugin completes what a schema declares, so it has to know that a field is a reference to a type and which values an enum permits. The package has one reader of each, `declarationOf` and `enumTokensOf`, and neither was exported, which left a consumer the choice of copying a pattern or not offering the value. Both are now exports; nothing about how they read changed, and core does not move.

The plugin's design is in companygraph/obsidian-plugin under `docs/superpowers/specs/`, and its §7 names this change. It is a minor release because a consumer can now take something it could not; taking it asks nothing of any existing consumer.

Verified: npm run verify, test:instance, test:instance-checks and test:rules pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Report the pull request and its check. **Merging it, tagging the release and writing its notes are the owner's.** Tasks 3 to 6 do not wait for it; Task 7 does.

---

### Task 3: The manifest and the two guards

**Files:**

- Create: `src/manifest.ts`
- Test: `test/manifest.test.ts`

**Interfaces:**

- Consumes: `isNewer(a, b)` from `companygraph-meta-model/checks`; `referenceManifest()` from `test/helpers.ts`.
- Produces: `interface InstanceManifest { tooling: string | null; coreVersion: string | null; units: string }`; `type Guard = { kind: "ok" } | { kind: "report"; message: string } | { kind: "refuse"; message: string }`; `readManifest(text: string): InstanceManifest` (throws on text that is not JSON); `guard(manifest: InstanceManifest, checker: string): Guard`.

- [ ] **Step 1: Branch, the one branch Tasks 3 to 9 share**

```sh
cd ~/git/companygraph/obsidian-plugin && git switch -c validate-and-complete
```

- [ ] **Step 2: Write the failing test, `test/manifest.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readManifest, guard } from "../src/manifest.ts";
import { referenceManifest } from "./helpers.ts";

test("the reference instance's manifest names its units folder and its two releases", () => {
  const m = readManifest(referenceManifest());
  assert.equal(m.units, "meta");
  assert.match(m.tooling!, /^\d+\.\d+\.\d+$/);
  assert.match(m.coreVersion!, /^\d+\.\d+\.\d+$/);
});

test("units defaults to meta, and a missing release is null rather than a guess", () => {
  assert.deepEqual(readManifest("{}"), { tooling: null, coreVersion: null, units: "meta" });
});

test("a core newer than the checker is refused, compared as releases and not as text", () => {
  const g = guard({ tooling: "0.9.0", coreVersion: "0.10.0", units: "meta" }, "0.9.0");
  assert.equal(g.kind, "refuse");
  assert.match((g as { message: string }).message, /0\.10\.0/);
});

test("a tooling pin naming another release is reported and does not refuse", () => {
  const g = guard({ tooling: "0.27.0", coreVersion: "0.27.0", units: "meta" }, "0.28.0");
  assert.equal(g.kind, "report");
});

test("a core behind the checker with a matching pin is fine", () => {
  assert.deepEqual(guard({ tooling: "0.28.0", coreVersion: "0.27.0", units: "meta" }, "0.28.0"), { kind: "ok" });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `node --test test/manifest.test.ts` Expected: FAIL, `Cannot find module '…/src/manifest.ts'`.

- [ ] **Step 4: Write `src/manifest.ts`**

```ts
// The instance's own manifest, and the two guards a checker keeps between its release and the
// core an instance vendored. Pure: the caller reads the file and names the bundled release.
import { isNewer } from "companygraph-meta-model/checks";

export interface InstanceManifest {
  tooling: string | null;
  coreVersion: string | null;
  units: string;
}

export type Guard =
  | { kind: "ok" }
  | { kind: "report"; message: string }
  | { kind: "refuse"; message: string };

const RELEASE = /^\d+\.\d+\.\d+$/;

export function readManifest(text: string): InstanceManifest {
  const raw = JSON.parse(text);
  return {
    tooling: typeof raw.tooling === "string" ? raw.tooling : null,
    coreVersion: typeof raw.core?.version === "string" ? raw.core.version : null,
    units: typeof raw.units === "string" ? raw.units : "meta",
  };
}

// Refuse a core newer than the checker: it would meet a folder it has never heard of and report
// a broken model. Report, and still run, a tooling pin that names another release: CI's refusal
// is the gate for that, and a plugin that refuses helps nobody in the editor.
export function guard(manifest: InstanceManifest, checker: string): Guard {
  const core = manifest.coreVersion;
  if (core && RELEASE.test(core) && isNewer(core, checker))
    return {
      kind: "refuse",
      message: `this vault vendors core ${core} and the plugin bundles checker ${checker}; take a plugin release that bundles ${core} or newer`,
    };
  if (manifest.tooling && manifest.tooling !== checker)
    return {
      kind: "report",
      message: `.companygraph/manifest.json names tooling ${manifest.tooling} and the plugin bundles ${checker}; CI is the gate for that pin`,
    };
  return { kind: "ok" };
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `node --test test/manifest.test.ts` Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```sh
git add src/manifest.ts test/manifest.test.ts
git commit -F - <<'EOF'
The manifest is read, and a core newer than the checker is refused

A vault is an instance when it carries a manifest, and the manifest names where the
vendored units sit and which releases the instance chose. The two guards are the
command-line checker's, with one change: a tooling pin that names another release is
reported and the checks still run, because CI's refusal is the gate for that pin and a
plugin that refuses helps nobody in the editor.

Verified: node --test test/manifest.test.ts passes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: One rebuild, the checks and the parse

**Files:**

- Create: `src/model.ts`
- Test: `test/model.test.ts`

**Interfaces:**

- Consumes: `checkInstance(files, { core, model })` returning `{ failures: string[], skipped: string[] }` from `companygraph-meta-model/checks`; `parseInstance(files, { sub, schemas })` from `companygraph-meta-model/instance`, which takes content keyed **relative to the container** (`skills/x.md`, not `model/skills/x.md`), schemas keyed bare (`skill-schema.md`), and throws on an unresolvable reference, a duplicate name, an undeclared folder, a missing identity.
- Produces: `interface Layout { core: string; model: string }`; `interface Model { failures: string[]; skipped: string[]; graph: Graph | null; schemas: Map<string, string> }`; `schemasOf(files, layout): Map<string, string>`; `buildModel(files, layout): Model`; `namesByType(graph): Map<string, string[]>`.

- [ ] **Step 1: Write the failing test, `test/model.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType } from "../src/model.ts";
import { example, EXAMPLE, reference, REFERENCE, edited } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";

test("the example passes and parses", () => {
  const m = buildModel(example(), EXAMPLE);
  assert.deepEqual(m.failures, []);
  assert.deepEqual(m.skipped, []);
  assert.ok(m.graph);
  assert.deepEqual(namesByType(m.graph!).get("source"), ["Google Workspace", "Local"]);
});

test("the reference instance passes and parses, in its own layout", () => {
  const m = buildModel(reference(), REFERENCE);
  assert.deepEqual(m.failures, []);
  assert.ok(m.graph);
});

test("an unresolvable reference is reported once: the checks speak, the parser's throw is dropped", () => {
  const m = buildModel(edited(example(), ROLE, (t) => t.replace("source: Local", "source: Nowhere")), EXAMPLE);
  assert.equal(m.graph, null);
  assert.equal(m.failures.length, 1);
  assert.ok(m.failures[0].startsWith(ROLE + ": "));
});

test("a core with a schema missing names the type as skipped", () => {
  const files = example();
  files.delete("core/skill-schema.md");
  assert.ok(buildModel(files, EXAMPLE).skipped.includes("skill"));
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/model.test.ts` Expected: FAIL, `Cannot find module '…/src/model.ts'`.

- [ ] **Step 3: Write `src/model.ts`**

```ts
// One rebuild: the checks over the whole map, then the parse. Pure.
import { checkInstance } from "companygraph-meta-model/checks";
import { parseInstance } from "companygraph-meta-model/instance";
import type { Graph } from "companygraph-meta-model/instance";

export interface Layout {
  core: string;   // where the vendored schemas sit, e.g. "meta/core"
  model: string;  // the container, e.g. "model"
}

export interface Model {
  failures: string[];
  skipped: string[];
  graph: Graph | null;
  schemas: Map<string, string>;
}

export function schemasOf(files: Map<string, string>, layout: Layout): Map<string, string> {
  const schemas = new Map<string, string>();
  const prefix = layout.core + "/";
  for (const [path, text] of files)
    if (path.startsWith(prefix) && path.endsWith("-schema.md")) schemas.set(path.slice(prefix.length), text);
  return schemas;
}

export function buildModel(files: Map<string, string>, layout: Layout): Model {
  const { failures, skipped } = checkInstance(files, layout);
  const schemas = schemasOf(files, layout);
  const content = new Map<string, string>();
  const prefix = layout.model + "/";
  for (const [path, text] of files)
    if (path.startsWith(prefix) && path.endsWith(".md")) content.set(path.slice(prefix.length), text);
  let graph: Graph | null = null;
  try {
    graph = parseInstance(content, { sub: prefix, schemas });
  } catch (error) {
    // The checks are the fuller report of what the parser throws on. Its message is shown only
    // when they found nothing and it threw all the same.
    if (failures.length === 0) failures.push(error instanceof Error ? error.message : String(error));
  }
  return { failures, skipped, graph, schemas };
}

// The canonical names of every type, sorted, from a graph that parsed.
export function namesByType(graph: Graph): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const e of graph.entities) {
    if (!names.has(e.type)) names.set(e.type, []);
    names.get(e.type)!.push(e.name);
  }
  for (const list of names.values()) list.sort((a, b) => a.localeCompare(b));
  return names;
}
```

- [ ] **Step 4: Run it, then the typecheck**

Run: `node --test test/model.test.ts` Expected: 4 tests pass.

Run: `npm run typecheck` Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```sh
git add src/model.ts test/model.test.ts
git commit -F - <<'EOF'
One rebuild runs the checks over the whole map, then the parse

A reference crosses files, so the unit of checking is the instance and never the file
being edited. The checks and the parser report the same findings in two voices, and the
checks are the fuller one, so the parser's throw is shown only when the checks found
nothing and it threw all the same. The graph is null when the parse failed, which is
what lets completion keep the names of the last rebuild that parsed.

Verified: node --test test/model.test.ts passes against the example and the reference
instance; npm run typecheck is clean.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: A failure, located

> **Superseded by review, 2026-09-18.** The `src/locate.ts` and the tests below are what was first committed. Review found that a failure about a body table or a grouped heading quotes its section before its value, so the first match was the section's heading. The committed code treats a quoted `## Section` as an anchor for the search and scopes the field search to the frontmatter; three tests hold that. Read the repository, not this block. The signature `locate(failure, files): Located` did not change.

**Files:**

- Create: `src/locate.ts`
- Test: `test/locate.test.ts`

**Interfaces:**

- Consumes: `buildModel` and the fixture helpers, in the test only.
- Produces: `interface Located { path: string | null; line: number; message: string }` (`line` zero-based; `path` null when the failure is about the instance); `locate(failure: string, files: Map<string, string>): Located`.

The shapes a failure takes, from `lib/checks.mjs`: most open with the file's path and a colon, `model/roles/writer.md: …`; some open with a folder, `model/stray/ is not a folder of any type`; a few name no path, `two skill files share the canonical name "X"`. A value is quoted in double quotes and a field in backticks.

- [ ] **Step 1: Write the failing test, `test/locate.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/model.ts";
import { locate } from "../src/locate.ts";
import { example, EXAMPLE, edited } from "./helpers.ts";

const ROLE = "example/model/roles/backend-engineer.md";
const lineOf = (files: Map<string, string>, file: string, text: string) =>
  files.get(file)!.split("\n").findIndex((l) => l.includes(text));

test("a scalar reference that does not resolve lands on its field's line", () => {
  const files = edited(example(), ROLE, (t) => t.replace("source: Local", "source: Nowhere"));
  const [failure] = buildModel(files, EXAMPLE).failures;
  const at = locate(failure, files);
  assert.equal(at.path, ROLE);
  assert.equal(at.line, lineOf(files, ROLE, "source: Nowhere"));
  assert.ok(!at.message.startsWith(ROLE));
});

test("an entry of a block sequence lands on the entry, not on the key above it", () => {
  const files = edited(example(), ROLE, (t) => t.replace("  - Java Programming", "  - Java Programming\n  - Cobol"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("Cobol"))!;
  assert.equal(locate(failure, files).line, lineOf(files, ROLE, "- Cobol"));
});

test("an undeclared field lands on the field", () => {
  const files = edited(example(), ROLE, (t) => t.replace("source: Local", "source: Local\nbogus: 1"));
  const failure = buildModel(files, EXAMPLE).failures.find((f) => f.includes("bogus"))!;
  assert.equal(locate(failure, files).line, lineOf(files, ROLE, "bogus: 1"));
});

test("a failure that names no file belongs to the instance", () => {
  const at = locate('two skill files share the canonical name "Java Programming"', example());
  assert.deepEqual(at, { path: null, line: 0, message: 'two skill files share the canonical name "Java Programming"' });
});

test("a failure about a folder belongs to the instance", () => {
  assert.equal(locate("example/model/stray/ is not a folder of any type (expected one of skills)", example()).path, null);
});

test("a path with nothing findable in the file falls back to its first line", () => {
  const at = locate(`${ROLE}: no H1, so nothing derives a filename (R2)`, example());
  assert.deepEqual([at.path, at.line], [ROLE, 0]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/locate.test.ts` Expected: FAIL, `Cannot find module '…/src/locate.ts'`.

- [ ] **Step 3: Write `src/locate.ts`**

```ts
// A failure is a string. Until the checks return a structure, this reads it: the file from the
// path the message opens with, the line from the value or the field the message quotes.
export interface Located {
  path: string | null; // null: the failure is about the instance, not one file
  line: number;        // zero-based; 0 when nothing in the message could be found in the file
  message: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function locate(failure: string, files: Map<string, string>): Located {
  const lead = failure.match(/^(\S+?):? /)?.[1] ?? null;
  if (!lead || !files.has(lead)) return { path: null, line: 0, message: failure };
  const message = failure.startsWith(lead + ": ") ? failure.slice(lead.length + 2) : failure;
  const lines = files.get(lead)!.split("\n");
  const values = [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const fields = [...message.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

  // A field the message names: its own line, or the line under it that carries the value, which
  // is where an entry of a block sequence sits.
  for (const field of fields) {
    const at = lines.findIndex((l) => new RegExp(`^${escape(field)}:`).test(l));
    if (at < 0) continue;
    for (const value of values) {
      for (let i = at; i < lines.length && (i === at || /^\s+-\s/.test(lines[i])); i++)
        if (lines[i].includes(value)) return { path: lead, line: i, message };
    }
    return { path: lead, line: at, message };
  }
  for (const value of values) {
    const at = lines.findIndex((l) => l.includes(value));
    if (at >= 0) return { path: lead, line: at, message };
  }
  return { path: lead, line: 0, message };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --test test/locate.test.ts` Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```sh
git add src/locate.ts test/locate.test.ts
git commit -F - <<'EOF'
A failure is mapped to its file, and to a line where one can be found

The checks return strings. The file is exact, because every check builds its path through
one constant and the message opens with it; the line is found by the field or the value
the message quotes and falls back to the first line. This is a reading of prose and is
admitted as one: it stands until the checks return a structure and is deleted that day.

Verified: node --test test/locate.test.ts passes, on failures the real checks produced.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: The cursor's context

> **Superseded by review, 2026-09-18.** The `src/context.ts` below carried `cellsOf`, its own copy of the package's cell splitter, which the design's first non-goal rules out. The committed code reads the header row with the package's `tableOf` and returns no cell context for a table without a valid separator row; one test holds that, and `tableOf` is declared in `src/meta-model.d.ts`. Read the repository, not this block. The signature `contextAt(lines, line, ch): Context | null` did not change.

**Files:**

- Create: `src/context.ts`
- Test: `test/context.test.ts`

**Interfaces:**

- Produces: `type Context = { kind: "key"; typed; start } | { kind: "value"; field; typed; start } | { kind: "cell"; section; column; typed; start } | { kind: "heading"; typed; start }` with `typed: string`, `start: number`, `field`, `section`, `column: string`; `frontmatterEnd(lines: string[]): number`; `contextAt(lines: string[], line: number, ch: number): Context | null`. `column` is the **name in the table's header row**, never a position: a schema declares columns by name.

- [ ] **Step 1: Write the failing test, `test/context.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { contextAt } from "../src/context.ts";

const FILE = [
  "---",            // 0
  "source: Lo",     // 1
  "roles:",         // 2
  "  - Rev",        // 3
  "nat",            // 4
  "---",            // 5
  "",               // 6
  "# Mira",         // 7
  "",               // 8
  "## Skills",      // 9
  "",               // 10
  "| Skill | Level | Evidence |", // 11
  "| --- | --- | --- |",          // 12
  "| Java | Exp",                 // 13
  "",               // 14
  "## Su",          // 15
  "source: not a field down here", // 16
];
const at = (line: number) => contextAt(FILE, line, FILE[line].length);

test("after a key's colon: the value of that field", () => {
  assert.deepEqual(at(1), { kind: "value", field: "source", typed: "Lo", start: 8 });
});

test("on an entry of a block sequence: the value of the key above", () => {
  assert.deepEqual(at(3), { kind: "value", field: "roles", typed: "Rev", start: 4 });
});

test("at the start of a frontmatter line: a key", () => {
  assert.deepEqual(at(4), { kind: "key", typed: "nat", start: 0 });
});

test("in a table row: the cell's column by the header's name, under its section", () => {
  assert.deepEqual(at(13), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9 });
});

test("the header and separator rows are not cells", () => {
  assert.equal(at(11), null);
  assert.equal(at(12), null);
});

test("on a heading line: a section", () => {
  assert.deepEqual(at(15), { kind: "heading", typed: "Su", start: 3 });
});

test("a line in the body that reads like a field is not one", () => {
  assert.equal(at(16), null);
});

test("the fences and a file with no frontmatter offer no key", () => {
  assert.equal(at(0), null);
  assert.equal(contextAt(["sou"], 0, 3), null);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/context.test.ts` Expected: FAIL, `Cannot find module '…/src/context.ts'`.

- [ ] **Step 3: Write `src/context.ts`**

```ts
// Where the cursor is, in the terms completion answers in. Pure: lines and a position in, a
// context or null out. `start` is the column the typed text begins at, which is what a
// candidate replaces.
export type Context =
  | { kind: "key"; typed: string; start: number }
  | { kind: "value"; field: string; typed: string; start: number }
  | { kind: "cell"; section: string; column: string; typed: string; start: number }
  | { kind: "heading"; typed: string; start: number };

// The line the frontmatter closes on, or -1 when the file opens with none.
export function frontmatterEnd(lines: string[]): number {
  return lines[0] === "---" ? lines.indexOf("---", 1) : -1;
}

const cellsOf = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function contextAt(lines: string[], line: number, ch: number): Context | null {
  const before = (lines[line] ?? "").slice(0, ch);
  const end = frontmatterEnd(lines);

  if (end > 0 && line > 0 && line < end) {
    const item = before.match(/^\s*-\s+(.*)$/);
    if (item) {
      let up = line - 1;
      while (up > 0 && /^\s*-\s/.test(lines[up])) up--;
      const key = lines[up].match(/^([\w-]+):\s*$/)?.[1];
      return key ? { kind: "value", field: key, typed: item[1], start: ch - item[1].length } : null;
    }
    const value = before.match(/^([\w-]+):\s*(.*)$/);
    if (value) return { kind: "value", field: value[1], typed: value[2], start: ch - value[2].length };
    if (/^[\w-]*$/.test(before)) return { kind: "key", typed: before, start: 0 };
    return null;
  }
  if (line <= end) return null;

  const heading = before.match(/^## (.*)$/);
  if (heading) return { kind: "heading", typed: heading[1], start: 3 };

  if (before.trimStart().startsWith("|")) {
    let first = line;
    while (first > 0 && lines[first - 1].trim().startsWith("|")) first--;
    if (line - first < 2) return null; // the header row and the separator row are not cells
    let up = first - 1;
    while (up >= 0 && !lines[up].startsWith("## ")) up--;
    if (up < 0) return null;
    const index = before.split("|").length - 2;
    const column = cellsOf(lines[first])[index];
    if (!column) return null;
    const typed = before.slice(before.lastIndexOf("|") + 1).trimStart();
    return { kind: "cell", section: lines[up].slice(3).trim(), column, typed, start: ch - typed.length };
  }
  return null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --test test/context.test.ts` Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```sh
git add src/context.ts test/context.test.ts
git commit -F - <<'EOF'
The cursor's position is read as one of four contexts

Completion answers a question the cursor asks: a frontmatter key, a field's value, a
cell of a table section, a section heading. The frontmatter is scoped by its fences so a
body line that reads like a field is not one, and a cell is named by its header and not
by its position, because a schema declares a column by name.

Verified: node --test test/context.test.ts passes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7: The pin moves, and the vocabulary is read

**Blocked until** Task 2's pull request is merged and released by the owner. Check: `gh release view --repo companygraph/meta-model --json tagName --jq .tagName` names a tag newer than the one in `package.json`, and that release's notes name the two exports.

**Files:**

- Modify: `package.json`, `package-lock.json` (by npm), `src/meta-model.d.ts`
- Create: `src/vocabulary.ts`
- Test: `test/vocabulary.test.ts`

**Interfaces:**

- Consumes: `parseSchemas(schemas)` whose entities have `id: "core/<type>"` and `sections`, each with `heading`, `tables: { caption, columns, rows }[]` and `table` (the first); `declarationOf`, `enumTokensOf`, `COLUMN_CAPTION`; `schemasOf` from Task 4.
- Produces: `type Offer = { kind: "names"; target: string } | { kind: "values"; values: string[] } | { kind: "none" }`; `interface Field { name; required: boolean; list: boolean; offer: Offer }`; `interface Column { name; offer: Offer }`; `interface SectionDecl { heading; required: boolean; columns: Column[] | null }`; `interface TypeVocabulary { fields: Field[]; sections: SectionDecl[] }`; `vocabularyOf(schemas: Map<string, string>): Map<string, TypeVocabulary>` keyed by type.

- [ ] **Step 1: Move the pin by name**

```sh
TAG=$(gh release view --repo companygraph/meta-model --json tagName --jq .tagName)
npm install "companygraph-meta-model@github:companygraph/meta-model#$TAG"
npm test
```

Expected: the fixtures script fetches the meta-model again at the new tag, and every test passes, the pin test among them.

- [ ] **Step 2: Declare the two exports in `src/meta-model.d.ts`**

Inside `declare module "companygraph-meta-model/checks"`, add:

```ts
  export function enumTokensOf(description: string): string[];
```

Inside `declare module "companygraph-meta-model/instance"`, add:

```ts
  export interface Declaration { form: "ref" | "ref?" | "qualifier"; target: string }
  export function declarationOf(cell: string | undefined): Declaration | null;
```

- [ ] **Step 3: Write the failing test, `test/vocabulary.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { example, EXAMPLE } from "./helpers.ts";

const vocabulary = vocabularyOf(schemasOf(example(), EXAMPLE));

test("a reference field offers the names of the type it declares", () => {
  const source = vocabulary.get("skill")!.fields.find((f) => f.name === "source")!;
  assert.deepEqual(source, { name: "source", required: true, list: false, offer: { kind: "names", target: "source" } });
});

test("an enum field offers the values its description opens with", () => {
  const nature = vocabulary.get("profile")!.fields.find((f) => f.name === "nature")!;
  assert.deepEqual(nature.offer, { kind: "values", values: ["human", "agent"] });
});

test("a list of references is a list", () => {
  const roles = vocabulary.get("profile")!.fields.find((f) => f.name === "roles")!;
  assert.equal(roles.list, true);
  assert.deepEqual(roles.offer, { kind: "names", target: "role" });
});

test("a string field offers nothing", () => {
  assert.deepEqual(vocabulary.get("skill")!.fields.find((f) => f.name === "group")!.offer, { kind: "none" });
});

test("sections are the `## ` rows of the index table, and a table section carries its columns", () => {
  const profile = vocabulary.get("profile")!;
  assert.ok(!profile.sections.some((s) => s.heading.startsWith("#")));
  const skills = profile.sections.find((s) => s.heading === "Skills")!;
  assert.deepEqual(skills.columns!.map((c) => c.name), ["Skill", "Level", "Evidence"]);
  assert.deepEqual(skills.columns![0].offer, { kind: "names", target: "skill" });
  assert.equal(vocabulary.get("skill")!.sections.find((s) => s.heading === "In practice")!.columns, null);
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `node --test test/vocabulary.test.ts` Expected: FAIL, `Cannot find module '…/src/vocabulary.ts'`.

- [ ] **Step 5: Write `src/vocabulary.ts`**

```ts
// What each type's schema declares, in the shape completion asks for. Every Type cell goes
// through the package's one reader, declarationOf, and every enum's values through
// enumTokensOf; this file reads tables by their column names and interprets nothing.
import { parseSchemas, declarationOf } from "companygraph-meta-model/instance";
import type { Table } from "companygraph-meta-model/instance";
import { enumTokensOf, COLUMN_CAPTION } from "companygraph-meta-model/checks";

export type Offer =
  | { kind: "names"; target: string }   // the canonical names of one type
  | { kind: "values"; values: string[] } // an enum's permitted values
  | { kind: "none" };

export interface Field { name: string; required: boolean; list: boolean; offer: Offer }
export interface Column { name: string; offer: Offer }
export interface SectionDecl { heading: string; required: boolean; columns: Column[] | null }
export interface TypeVocabulary { fields: Field[]; sections: SectionDecl[] }

const bare = (cell: string | undefined) => (cell ?? "").replace(/`/g, "").trim();

function offerOf(type: string | undefined, description: string | undefined): Offer {
  const decl = declarationOf(type);
  if (decl) return { kind: "names", target: decl.target };
  if (bare(type) === "enum") return { kind: "values", values: enumTokensOf(description ?? "") };
  return { kind: "none" };
}

// One row of a schema table as an object keyed by the table's own column names.
const rowsOf = (table: Table | undefined) =>
  (table?.rows ?? []).map((row) => Object.fromEntries(table!.columns.map((c, i) => [c, row[i]])));

export function vocabularyOf(schemas: Map<string, string>): Map<string, TypeVocabulary> {
  const vocabulary = new Map<string, TypeVocabulary>();
  for (const e of parseSchemas(schemas).entities) {
    const type = e.id.slice("core/".length);
    const frontmatter = e.sections.find((s) => s.heading === "Frontmatter");
    const fields = rowsOf(frontmatter?.table).map((r) => ({
      name: bare(r.Field),
      required: bare(r.Required) === "Yes",
      list: bare(r.Type).startsWith("array of "),
      offer: offerOf(r.Type, r.Description),
    }));

    const tables = e.sections.find((s) => s.heading === "Sections")?.tables ?? [];
    const columnsBySection = new Map<string, Column[]>();
    for (const t of tables) {
      const section = t.caption?.match(COLUMN_CAPTION)?.[1];
      if (!section) continue;
      columnsBySection.set(section.trim(), rowsOf(t).map((r) => ({ name: bare(r.Column), offer: offerOf(r.Type, r.Description) })));
    }
    const index = tables.find((t) => !t.caption);
    const sections = rowsOf(index)
      .filter((r) => bare(r.Section).startsWith("## "))
      .map((r) => {
        const heading = bare(r.Section).slice(3).trim();
        return { heading, required: bare(r.Required) === "Yes", columns: columnsBySection.get(heading) ?? null };
      });
    vocabulary.set(type, { fields, sections });
  }
  return vocabulary;
}
```

- [ ] **Step 6: Run it, and the typecheck**

Run: `node --test test/vocabulary.test.ts && npm run typecheck` Expected: 5 tests pass, the typecheck is clean.

- [ ] **Step 7: Commit**

```sh
git add package.json package-lock.json src/meta-model.d.ts src/vocabulary.ts test/vocabulary.test.ts
git commit -F - <<'EOF'
The pin moves to the release that exports the two readers

Completion offers what a schema declares, and the vocabulary is read for it here: per
type, the fields with whether each is required, a list, a reference or an enum, and the
sections with the columns a table section declares. Every Type cell goes through the
package's declarationOf and every enum through its enumTokensOf, which is why the pin had
to move first; this file reads tables by their column names and interprets nothing.

Verified: npm test passes with the pin test, npm run typecheck is clean.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 8: What is offered

**Files:**

- Create: `src/candidates.ts`
- Test: `test/candidates.test.ts`

**Interfaces:**

- Consumes: `Context`, `frontmatterEnd` (Task 6); `Offer`, `TypeVocabulary` (Task 7); `namesByType` output (Task 4).
- Produces: `interface Candidate { label: string; insert: string }`; `candidatesFor(context: Context, vocabulary: TypeVocabulary, names: Map<string, string[]>, lines: string[]): Candidate[]`. `vocabulary` is the one type's, already chosen by the caller from the file's path.

- [ ] **Step 1: Write the failing test, `test/candidates.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, namesByType, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { candidatesFor } from "../src/candidates.ts";
import { example, EXAMPLE } from "./helpers.ts";

const files = example();
const vocabulary = vocabularyOf(schemasOf(files, EXAMPLE));
const names = namesByType(buildModel(files, EXAMPLE).graph!);
const profile = vocabulary.get("profile")!;
const labels = (c: { label: string }[]) => c.map((x) => x.label);

test("a reference value offers the names of its type, those starting with what is typed first", () => {
  const c = candidatesFor({ kind: "value", field: "source", typed: "lo", start: 8 }, profile, names, []);
  assert.deepEqual(c, [{ label: "Local", insert: "Local" }]);
});

test("a name of another type is never offered", () => {
  const c = candidatesFor({ kind: "value", field: "roles", typed: "", start: 4 }, profile, names, []);
  assert.deepEqual(labels(c), ["Backend Engineer", "Reviewer"]);
});

test("an enum value offers what the schema permits", () => {
  const c = candidatesFor({ kind: "value", field: "nature", typed: "", start: 8 }, profile, names, []);
  assert.deepEqual(labels(c), ["human", "agent"]);
});

test("a key offers what the file lacks, required first, and a list opens its first entry", () => {
  const lines = ["---", "source: Local", "", "---"];
  const c = candidatesFor({ kind: "key", typed: "", start: 0 }, profile, names, lines);
  assert.ok(!labels(c).includes("source (required)"));
  assert.equal(c[0].label, "nature (required)");
  assert.equal(c.find((x) => x.label === "roles")!.insert, "roles:\n  - ");
});

test("a cell offers by the column's declaration", () => {
  const c = candidatesFor({ kind: "cell", section: "Skills", column: "Level", typed: "pro", start: 0 }, profile, names, []);
  assert.deepEqual(labels(c), ["Proficient"]);
  assert.deepEqual(candidatesFor({ kind: "cell", section: "Skills", column: "Evidence", typed: "", start: 0 }, profile, names, []), []);
});

test("a heading offers the sections the file lacks", () => {
  const c = candidatesFor({ kind: "heading", typed: "", start: 3 }, profile, names, ["## Skills", "## "]);
  assert.ok(!labels(c).some((l) => l.startsWith("Skills")));
  assert.ok(c.length > 0);
});

test("with no parsed graph there are no names, and enum values still come", () => {
  const none = new Map<string, string[]>();
  assert.deepEqual(candidatesFor({ kind: "value", field: "source", typed: "", start: 0 }, profile, none, []), []);
  assert.equal(candidatesFor({ kind: "value", field: "nature", typed: "", start: 0 }, profile, none, []).length, 2);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/candidates.test.ts` Expected: FAIL, `Cannot find module '…/src/candidates.ts'`.

- [ ] **Step 3: Write `src/candidates.ts`**

```ts
// What is offered in one context. Schemas say what may be written, the last parsed graph says
// which names exist, the file says what is already there. Nothing is offered that would not
// resolve, and nothing is wrapped: a name is inserted plain (R3).
import type { Context } from "./context.ts";
import { frontmatterEnd } from "./context.ts";
import type { Offer, TypeVocabulary } from "./vocabulary.ts";

export interface Candidate { label: string; insert: string }

const requiredFirst = <T extends { required: boolean }>(items: T[]) =>
  [...items.filter((i) => i.required), ...items.filter((i) => !i.required)];

function offered(offer: Offer, names: Map<string, string[]>): string[] {
  if (offer.kind === "names") return names.get(offer.target) ?? [];
  if (offer.kind === "values") return offer.values;
  return [];
}

// Those that start with what is typed, then those that contain it; case does not decide.
function matching(values: string[], typed: string): string[] {
  const t = typed.trim().toLowerCase();
  const starts = values.filter((v) => v.toLowerCase().startsWith(t));
  const holds = values.filter((v) => !v.toLowerCase().startsWith(t) && v.toLowerCase().includes(t));
  return [...starts, ...holds];
}

export function candidatesFor(
  context: Context,
  vocabulary: TypeVocabulary,
  names: Map<string, string[]>,
  lines: string[],
): Candidate[] {
  if (context.kind === "key") {
    const end = frontmatterEnd(lines);
    const present = new Set(lines.slice(1, end).map((l) => l.match(/^([\w-]+):/)?.[1]).filter(Boolean));
    const absent = requiredFirst(vocabulary.fields.filter((f) => !present.has(f.name)));
    return matching(absent.map((f) => f.name), context.typed).map((name) => {
      const field = absent.find((f) => f.name === name)!;
      return { label: field.required ? `${name} (required)` : name, insert: field.list ? `${name}:\n  - ` : `${name}: ` };
    });
  }
  if (context.kind === "value") {
    const field = vocabulary.fields.find((f) => f.name === context.field);
    if (!field) return [];
    return matching(offered(field.offer, names), context.typed).map((v) => ({ label: v, insert: v }));
  }
  if (context.kind === "cell") {
    const column = vocabulary.sections
      .find((s) => s.heading === context.section)
      ?.columns?.find((c) => c.name === context.column);
    if (!column) return [];
    return matching(offered(column.offer, names), context.typed).map((v) => ({ label: v, insert: v }));
  }
  const present = new Set(lines.map((l) => l.match(/^## (.+?)\s*$/)?.[1]).filter(Boolean));
  const absent = requiredFirst(vocabulary.sections.filter((s) => !present.has(s.heading) || s.heading === context.typed.trim()));
  return matching(absent.map((s) => s.heading), context.typed).map((heading) => {
    const section = absent.find((s) => s.heading === heading)!;
    return { label: section.required ? `${heading} (required)` : heading, insert: heading };
  });
}
```

- [ ] **Step 4: Run the whole suite and the typecheck**

Run: `npm test && npm run typecheck` Expected: every test passes, the typecheck is clean.

- [ ] **Step 5: Commit**

```sh
git add src/candidates.ts test/candidates.test.ts
git commit -F - <<'EOF'
Completion offers what would resolve, and nothing else

A reference offers the names of the type its schema declares and of no other type, which
is the resolution rule applied to the offer: a name that exists only under another type
would not resolve, so it is not shown. Keys and sections are those the file lacks, the
required ones first, and a name is inserted plain, as the conventions write a reference.
With no parsed graph there are no names, and what the schemas alone supply still comes.

Verified: npm test passes, npm run typecheck is clean.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9: The plugin in Obsidian

**Files:**

- Create: `src/vault.ts`, `src/marks.ts`, `src/pane.ts`, `src/suggest.ts`, `styles.css`
- Modify: `src/main.ts` (replace the stub whole)

**Interfaces:**

- Consumes: everything Tasks 3 to 8 produce, with the signatures their Interfaces blocks give; `typeOfPath(rel, model)` from `companygraph-meta-model/checks`, which expects `rel` to begin with the container, so the caller tests that first.
- Produces: the default export `CompanyGraphPlugin` with `state: State`, `layout: Layout | null`, `vocabulary: Map<string, TypeVocabulary>`, `names: Map<string, string[]>`, which `pane.ts` and `suggest.ts` read; `interface State { status: "idle" | "refused" | "checked"; notice: string | null; located: Located[]; skipped: string[] }`.

Nothing in this task runs under Node. What holds it is the typecheck, the bundle, and Task 10.

- [ ] **Step 1: Write `src/vault.ts`**

```ts
// The vault as the map the parser and the checks take. The only file here that reads anything.
import type { App } from "obsidian";
import { readManifest } from "./manifest.ts";
import type { InstanceManifest } from "./manifest.ts";
import type { Layout } from "./model.ts";

export const MANIFEST = ".companygraph/manifest.json";

// What is read as text. Anything else enters the map with empty text: the structure check
// asks only whether a stray file is there, never what it holds.
const TEXT = new Set(["md", "json", "txt", "yml", "yaml"]);

// Obsidian keeps dot-folders out of the vault's file list, so the manifest is read through the
// adapter, which works on every platform. null: no manifest, so this vault is not an instance.
export async function loadManifest(app: App): Promise<InstanceManifest | null> {
  if (!(await app.vault.adapter.exists(MANIFEST))) return null;
  return readManifest(await app.vault.adapter.read(MANIFEST));
}

export const concerns = (path: string, layout: Layout) =>
  path.startsWith(layout.model + "/") || path.startsWith(layout.core + "/");

export async function readInstance(app: App, layout: Layout): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const file of app.vault.getFiles()) {
    if (!concerns(file.path, layout)) continue;
    files.set(file.path, TEXT.has(file.extension) ? await app.vault.cachedRead(file) : "");
  }
  return files;
}
```

- [ ] **Step 2: Write `src/marks.ts`**

```ts
// The open file's failures, marked on their lines. A CodeMirror state field fed by one effect;
// the message is the line's tooltip.
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";

export interface Mark { line: number; message: string }

export const setMarks = StateEffect.define<Mark[]>();

export const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setMarks)) continue;
      const byLine = new Map<number, string[]>();
      for (const mark of effect.value) byLine.set(mark.line, [...(byLine.get(mark.line) ?? []), mark.message]);
      const builder = new RangeSetBuilder<Decoration>();
      for (const [line, messages] of [...byLine].sort((a, b) => a[0] - b[0])) {
        if (line >= tr.state.doc.lines) continue;
        const from = tr.state.doc.line(line + 1).from;
        builder.add(from, from, Decoration.line({ class: "companygraph-mark", attributes: { title: messages.join("\n") } }));
      }
      marks = builder.finish();
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
```

- [ ] **Step 3: Write `src/pane.ts`**

```ts
// The report beside the editor: failures grouped by file, then what was not checked. It ends
// that way on every render, because a green list alone reads as a validated instance.
import { ItemView, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type CompanyGraphPlugin from "./main.ts";
import type { Located } from "./locate.ts";

export const VIEW_TYPE = "companygraph-checks";

export class Pane extends ItemView {
  plugin: CompanyGraphPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: CompanyGraphPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "CompanyGraph checks"; }
  getIcon() { return "list-checks"; }

  async onOpen() { this.render(); }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("companygraph-pane");
    const state = this.plugin.state;

    if (state.status === "idle") {
      el.createEl("p", { text: "This vault has no .companygraph/manifest.json, so it is not an instance and nothing is checked." });
      return;
    }
    if (state.notice) el.createEl("p", { text: state.notice, cls: "companygraph-notice" });
    if (state.status === "refused") return;

    const count = state.located.length;
    el.createEl("h4", { text: count === 0 ? "The mechanical checks pass" : `${count} failure${count > 1 ? "s" : ""}` });
    const byPath = new Map<string | null, Located[]>();
    for (const found of state.located) byPath.set(found.path, [...(byPath.get(found.path) ?? []), found]);
    for (const [path, group] of byPath) {
      el.createEl("h5", { text: path ?? "The instance" });
      const list = el.createEl("ul");
      for (const found of group) {
        const item = list.createEl("li", { text: found.message });
        if (found.path) item.onClickEvent(() => void this.open(found.path!, found.line));
      }
    }

    el.createEl("h4", { text: "Not checked" });
    const not = el.createEl("ul");
    for (const type of state.skipped) not.createEl("li", { text: `${type}: the vendored core carries no schema for it` });
    not.createEl("li", { text: "every ## Writing rules in every schema: that is the agent pass, R0" });
  }

  async open(path: string, line: number) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf(false).openFile(file, { eState: { line } });
  }
}
```

- [ ] **Step 4: Write `src/suggest.ts`**

```ts
// Completion: the cursor's context, the file's type from its path, the candidates for both.
import { EditorSuggest } from "obsidian";
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { contextAt } from "./context.ts";
import { candidatesFor } from "./candidates.ts";
import type { Candidate } from "./candidates.ts";

export class Suggest extends EditorSuggest<Candidate> {
  plugin: CompanyGraphPlugin;

  constructor(app: App, plugin: CompanyGraphPlugin) {
    super(app);
    this.plugin = plugin;
  }

  find(cursor: EditorPosition, editor: Editor, file: TFile | null) {
    const layout = this.plugin.layout;
    if (!layout || !file || !file.path.startsWith(layout.model + "/")) return null;
    const type = typeOfPath(file.path, layout.model);
    const vocabulary = type ? this.plugin.vocabulary.get(type) : undefined;
    if (!vocabulary) return null;
    const lines = editor.getValue().split("\n");
    const context = contextAt(lines, cursor.line, cursor.ch);
    if (!context) return null;
    const candidates = candidatesFor(context, vocabulary, this.plugin.names, lines);
    // What is typed is already the one thing on offer: nothing left to complete.
    if (candidates.length === 1 && candidates[0].insert === context.typed) return null;
    return candidates.length ? { context, candidates } : null;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const found = this.find(cursor, editor, file);
    if (!found) return null;
    return { start: { line: cursor.line, ch: found.context.start }, end: cursor, query: found.context.typed };
  }

  getSuggestions(context: EditorSuggestContext): Candidate[] {
    return this.find(context.end, context.editor, context.file)?.candidates ?? [];
  }

  renderSuggestion(candidate: Candidate, el: HTMLElement) {
    el.setText(candidate.label);
  }

  selectSuggestion(candidate: Candidate) {
    if (!this.context) return;
    const { editor, start, end } = this.context;
    editor.replaceRange(candidate.insert, start, end);
    const inserted = candidate.insert.split("\n");
    const last = inserted[inserted.length - 1];
    editor.setCursor(
      inserted.length === 1
        ? { line: start.line, ch: start.ch + last.length }
        : { line: start.line + inserted.length - 1, ch: last.length },
    );
  }
}
```

- [ ] **Step 5: Replace `src/main.ts`**

```ts
// The wiring: when to rebuild, and the three places a rebuild shows — the pane, the open file's
// lines and the status bar. Everything that decides anything is in the pure modules.
import { MarkdownView, Plugin, debounce } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { guard } from "./manifest.ts";
import { buildModel, namesByType } from "./model.ts";
import type { Layout } from "./model.ts";
import { locate } from "./locate.ts";
import type { Located } from "./locate.ts";
import { vocabularyOf } from "./vocabulary.ts";
import type { TypeVocabulary } from "./vocabulary.ts";
import { concerns, loadManifest, readInstance } from "./vault.ts";
import { Pane, VIEW_TYPE } from "./pane.ts";
import { Suggest } from "./suggest.ts";
import { marksField, setMarks } from "./marks.ts";

// The release of companygraph-meta-model this build bundles; esbuild.config.mjs defines it.
declare const __CHECKER_VERSION__: string;

export interface State {
  status: "idle" | "refused" | "checked";
  notice: string | null;
  located: Located[];
  skipped: string[];
}

const IDLE: State = { status: "idle", notice: null, located: [], skipped: [] };

export default class CompanyGraphPlugin extends Plugin {
  state: State = IDLE;
  layout: Layout | null = null;
  vocabulary = new Map<string, TypeVocabulary>();
  names = new Map<string, string[]>();
  statusBar: HTMLElement | null = null;

  async onload() {
    this.statusBar = this.addStatusBarItem();
    this.registerView(VIEW_TYPE, (leaf) => new Pane(leaf, this));
    this.registerEditorExtension(marksField);
    this.registerEditorSuggest(new Suggest(this.app, this));
    this.addCommand({ id: "open-checks", name: "Open the checks pane", callback: () => void this.openPane() });
    this.addCommand({ id: "check-now", name: "Check the instance now", callback: () => void this.rebuild() });

    // Once typing pauses. The path is tested before the debounce, not inside it: a debounced
    // call keeps only its last arguments, and the last file touched may not be the one that mattered.
    const soon = debounce(() => void this.rebuild(), 400, true);
    const changed = (path: string) => { if (this.layout && concerns(path, this.layout)) soon(); };
    this.registerEvent(this.app.vault.on("modify", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => changed(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, old) => { changed(file.path); changed(old); }));
    this.registerEvent(this.app.workspace.on("file-open", () => this.paint()));
    this.app.workspace.onLayoutReady(() => void this.rebuild());
  }

  async rebuild() {
    let manifest;
    try {
      manifest = await loadManifest(this.app);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return this.show({ ...IDLE, status: "refused", notice: `.companygraph/manifest.json does not parse: ${why}` });
    }
    if (!manifest) {
      this.layout = null;
      return this.show(IDLE);
    }
    this.layout = { core: `${manifest.units}/core`, model: "model" };
    const verdict = guard(manifest, __CHECKER_VERSION__);
    if (verdict.kind === "refuse") return this.show({ ...IDLE, status: "refused", notice: verdict.message });

    const files = await readInstance(this.app, this.layout);
    const model = buildModel(files, this.layout);
    try {
      this.vocabulary = vocabularyOf(model.schemas);
    } catch {
      // A vendored schema off the fixed shape. Core is never edited in an instance, so this is
      // a broken copy; the last vocabulary that read stays, and the manifest's hashes say which file.
    }
    // Names are those of the last rebuild that parsed: a reference is unresolvable exactly
    // while its name is half typed, which is when completion is wanted.
    if (model.graph) this.names = namesByType(model.graph);
    this.show({
      status: "checked",
      notice: verdict.kind === "report" ? verdict.message : null,
      located: model.failures.map((failure) => locate(failure, files)),
      skipped: model.skipped,
    });
  }

  show(state: State) {
    this.state = state;
    const failures = state.located.length;
    const unchecked = state.skipped.length + 1; // the writing rules, always
    this.statusBar?.setText(
      state.status === "idle" ? ""
        : state.status === "refused" ? "CompanyGraph: not checked"
        : `CompanyGraph: ${failures} failure${failures === 1 ? "" : "s"}, ${unchecked} not checked${state.notice ? ", pin differs" : ""}`,
    );
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof Pane) leaf.view.render();
    this.paint();
  }

  paint() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
      const path = leaf.view.file.path;
      const marks = this.state.located
        .filter((found) => found.path === path)
        .map((found) => ({ line: found.line, message: found.message }));
      // @ts-expect-error Obsidian's Editor wraps a CodeMirror 6 view and does not type it.
      const view = leaf.view.editor.cm as EditorView | undefined;
      view?.dispatch({ effects: setMarks.of(marks) });
    });
  }

  async openPane() {
    const open = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = open ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!open) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 6: Write `styles.css`**

```css
/* A line a failure was located on. The message is the line's tooltip. */
.companygraph-mark {
  background-color: rgba(var(--color-red-rgb), 0.12);
}

/* An entry of the pane opens its file, so it reads as something to press. */
.companygraph-pane li {
  cursor: pointer;
}

.companygraph-notice {
  color: var(--text-warning);
}
```

- [ ] **Step 7: Typecheck, test, build, and hold the phone rule**

Run: `npm run typecheck && npm test && npm run build` Expected: clean, every test passes, esbuild writes `main.js`.

Run: `grep -rn '"node:' src/ ; echo "exit $?"` Expected: no line printed, `exit 1`. A module under `src/` that imports from `node:` breaks the plugin on a phone.

- [ ] **Step 8: Commit**

```sh
git add src styles.css
git commit -F - <<'EOF'
A rebuild shows in the pane, on the open file's lines and in the status bar

The modules that touch Obsidian are kept thin, because nothing here can run them: one
reads the vault into the map the checks take, every file and not only the Markdown since
a stray file is a finding, and the manifest through the adapter since Obsidian lists no
dot-folder. The rest show a rebuild. The pane ends with what was not checked on every
render, the writing rules always among it, because a green list alone reads as a
validated instance.

A rebuild follows a change once typing pauses, and the path is tested before the
debounce: a debounced call keeps its last arguments only, and the last file touched may
not be the one that mattered.

Verified: npm run typecheck is clean, npm test passes, npm run build writes main.js, and
no module under src/ imports from node:. Not yet run inside Obsidian.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 10: Proof on the reference instance

This is the family's order for a tool: it is proven by hand on `robertblust/mental-model` before anything about it moves on. **It needs a person at a screen**; an agent prepares it and records what the person reports.

**Files:**

- Modify (in `~/git/robertblust/mental-model`, on a branch, its own pull request): `.gitignore`, one line `.obsidian/`
- Modify: `docs/superpowers/specs/2026-09-18-obsidian-plugin-design.md` §9, the findings

- [ ] **Step 1: Keep Obsidian's folder out of the instance**

```sh
cd ~/git/robertblust/mental-model && git switch main && git pull && git switch -c ignore-obsidian
printf '.obsidian/\n' >> .gitignore
```

Commit in that repository's register, run its `companygraph-validate` pass as its `AGENTS.md` requires, open the pull request, stop.

- [ ] **Step 2: Install the build into the vault**

```sh
cd ~/git/companygraph/obsidian-plugin && npm run build
mkdir -p ~/git/robertblust/mental-model/.obsidian/plugins/companygraph
cp main.js manifest.json styles.css ~/git/robertblust/mental-model/.obsidian/plugins/companygraph/
```

Open `~/git/robertblust/mental-model` as a vault in Obsidian, enable community plugins, enable CompanyGraph, run the command "CompanyGraph: Open the checks pane".

- [ ] **Step 3: Walk the checklist, in Source mode first, and write down each result**

1. The pane reads "The mechanical checks pass" and ends with the writing-rules line. The status bar reads `CompanyGraph: 0 failures, 1 not checked`.
2. In `model/roles/writer.md`, change `source: Local` to `source: Nowhere`. Within a second the pane lists one failure under that file, the line is marked, hovering the line shows the message, the status bar counts it. Clicking the entry from another file opens `writer.md` on that line.
3. Undo. The failure, the mark and the count go.
4. On a new frontmatter line type `so`: `source-id` is offered, and `source` is not, since the file has it. After `source: ` the sources are offered and no skill is.
5. In `model/profiles/robert-blust/robert-blust.md`, add a row to `## Skills`: the first cell offers skills, the second offers proficiency levels, the third offers nothing.
6. On a new line type `## `: the sections the profile schema declares and the file lacks are offered, the required ones first.
7. While `source: Nowh` is half typed and the instance does not parse, names are still offered from the last parse.
8. Rename `.companygraph/manifest.json` away and run "Check the instance now": the pane says the vault is not an instance and the status bar empties. Rename it back.
9. In `.companygraph/manifest.json`, set `core.version` to `99.0.0` and run the command: the pane refuses, naming both releases. Set `tooling` to `0.0.1` instead: the pane reports the pin and still checks. Restore the file with `git checkout`.
10. Repeat 4 to 6 in Live Preview, with Settings → Editor → Properties in document set to Visible, then to Source. Record what completes and what does not, and whether editing `roles` in the Properties widget rewrites the list as a block sequence.
11. For each failure produced in 2 and 5 and any other the person tries, record whether the marked line was the right one.

- [ ] **Step 4: Record the findings in the spec's §9 and commit**

Rewrite the **Live Preview** and **The line mapping's accuracy** entries of §9 with what was observed, written forward, and add an entry for anything else found. A defect in a pure module gets a failing test first, then the fix, as its own commit on this branch.

```sh
sh conventions/conventions-check
git add docs
git commit -F - <<'EOF'
What the reference instance found

<one to three paragraphs: what was observed in Source mode, in Live Preview, and of the line
mapping, cause before mechanism>

Verified: run by hand in Obsidian on robertblust/mental-model at <commit>; conventions-check passes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

The body is written from Step 3's record; the angle brackets mark what only that record supplies.

---

### Task 11: The pull request, the ruleset, the release, the family's list

- [ ] **Step 1: Push the branch and open the pull request. Stop**

```sh
git push -u origin validate-and-complete
gh pr create --title "The plugin checks an instance and completes what its schemas declare" --body-file - <<'EOF'
Version one, as the design in `docs/superpowers/specs/` describes it: the meta-model's checks over the whole vault on every change, shown in a pane, on the open file's lines and in the status bar, and completion for what the schemas declare. Six pure modules decide everything and are tested against the meta-model's example and the reference instance; five thin modules touch Obsidian and were proven by hand on the reference instance, with the findings recorded in the spec's §9.

No rule is implemented here. The two readers completion needed were exported by the meta-model in the release this pins.

Verified: npm run typecheck, npm test and npm run build pass; the checklist of the plan's Task 10 was walked in Obsidian on robertblust/mental-model.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Report the two checks, `test` and `conventions / conventions`. Merging is the owner's.

- [ ] **Step 2: After both checks have reported once, protect `main`. The owner's go is needed**

```sh
gh api repos/companygraph/obsidian-plugin/rulesets --method POST --input - <<'EOF'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "allowed_merge_methods": ["merge"], "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false, "require_last_push_approval": false,
        "required_approving_review_count": 0, "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true, "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "conventions / conventions" }, { "context": "test" }] } }
  ]
}
EOF
```

This is the ruleset `companygraph/mcp-server` carries, read from it on 2026-09-18.

- [ ] **Step 3: After the owner merges, the release. The owner's go is needed**

```sh
git switch main && git pull && npm ci && npm run build
gh release create v0.1.0 main.js manifest.json styles.css --title "v0.1.0" --notes-file - <<'EOF'
The first release. In a vault that is a CompanyGraph instance, the plugin runs the meta-model's checks over the whole model on every change and shows the result in a pane, on the open file's lines and in the status bar, and it completes what the file's schema declares: frontmatter fields and values, the cells of a table section, sections.

Nothing breaks, since nothing came before. To take it, copy the three attached files into `.obsidian/plugins/companygraph/` in the vault, or point BRAT at this repository. It bundles the meta-model release its `package.json` pins and refuses a vault whose vendored core is newer than that.
EOF
```

- [ ] **Step 4: The family's list, in `robertblust/conventions`, its own pull request**

Add the row to `conventions/REPOSITORIES.md`, after `companygraph/mcp-server`:

```markdown
| companygraph/obsidian-plugin | CompanyGraph — Obsidian Plugin | an Obsidian plugin for any instance: the meta-model's checks while the file is edited, and completion for what its schemas declare | main | ~/git/companygraph/obsidian-plugin |
```

In "What pins what", after the sentence on the MCP server, add: "The Obsidian plugin depends on `companygraph/meta-model` by tag for the parser and the checks, and bundles them." In "Re-syncing after a release", the plugin follows the MCP server and its deployment: "then the Obsidian plugin, which parses the models as the server does". That repository's own `AGENTS.md` says how it is released; a release of it is what puts the row in front of every member's title tripwire, this repository's included.

- [ ] **Step 5: The note on the tooling spec, in `companygraph/meta-model`, its own pull request**

In `docs/superpowers/specs/2026-08-25-companygraph-tooling-design.md`, under the `### check` heading, add as the first paragraph:

```markdown
`check` is not built here. It ships from this repository as `lib/checks.mjs`, by the amendment
in `2026-09-10-instance-checks-design.md`, and runs in three places: an instance's CI through
`instance-check.yml`, a shell through `bin/check-instance.mjs`, and the editor through
`companygraph/obsidian-plugin`. Whoever builds `init`, `add` and `upgrade` takes it from there.
```

---

## Self-review

**Spec coverage.** §2 repository and release: Tasks 1 and 11. §3 what is read, the two guards, the every-file map, the rebuild on change: Tasks 3, 4 and 9 (`vault.ts`, `main.ts`). §4 validation, the pane that ends with what was not checked, the mapping, the parser's throw, the marks, the status bar: Tasks 4, 5 and 9. §5 the four contexts, the candidates, plain insertion, names from the last parse: Tasks 6, 7, 8 and 9 (`suggest.ts`, `main.ts`). §6 testing, two fixtures, the hand proof: Tasks 1 and 10. §7 the two readers and the tooling-spec note: Tasks 2 and 11; the structured failure is proposed after Task 10's findings and is deliberately not a task here. §8 is version two and has no task. §9's open questions are answered by Task 10 where they can be.

**Placeholders.** Two values are read at run time by a command the step gives and are not written down, because they move: the meta-model's and the conventions' release tags. Task 10's commit body is written from what a person observes and says so. Nothing else is left open.

**Type consistency.** `Layout`, `Model`, `Located`, `Context`, `Offer`, `TypeVocabulary`, `Candidate` and `State` are each defined once and used under the same names in every later task; `buildModel(files, layout)`, `locate(failure, files)`, `contextAt(lines, line, ch)`, `vocabularyOf(schemas)` and `candidatesFor(context, vocabulary, names, lines)` are called in Task 9 with the signatures their own tasks give. All of it typechecked together in the prototype.
