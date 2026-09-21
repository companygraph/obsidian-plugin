# A profile shows its picture implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plugin bundles a checker that knows R9's `image`, hands the checks a vault's pictures as bytes, and draws the picture an entity carries where its name stands in the editor.

**Architecture:** The vault's reader is the one place that reads a file, and it now reads what `IMAGE_FILE` matches through Obsidian's `readBinary`, as a `Uint8Array`; read as text, which is what it did, a correct picture reaches the check as “read as text, not bytes”. The map's type says so, `Files = Map<string, string | Uint8Array>`, and only the checks and `locate` take it: everything that edits a note reads `textOf(files)`, the notes alone, so no rename plan or completion can meet bytes as a string. `locate` lands a failure that leads with a picture on the picture, at no line. The drawing follows the repository's own split: `picture.ts` decides what is drawn and is pure, `picturemark.ts` draws it from a state field as `headingmarks.ts` draws the heading marks, and the vocabulary learns one new kind of field, `image`, for which nothing is offered.

**Tech Stack:** TypeScript run by Node's type stripping, `node:test`, esbuild, CodeMirror 6 through Obsidian, the e2e suite under `e2e/` driving a real Obsidian over the DevTools protocol.

**Spec:** `docs/superpowers/specs/2026-09-21-a-profile-carries-an-image-design.md` in companygraph/meta-model (section “Beyond the card”, last paragraph).

Everything below was run once in a throwaway clone of `main` at 00e0313 against meta-model's image release. With the fixture moved to that release and nothing else changed, nine unit tests failed, each on the example's PNG reaching the checks as text; with this plan applied `npm run typecheck` is clean, the unit suite passes but for the three tests the scratch wiring itself breaks (the pin and the two NOTICE tests, which a real install satisfies), and `npm run e2e` passed 42 of 42 in Obsidian 1.13.7, the new test among them. Taking `readBinary` out of the reader made the new e2e test fail, and taking the guard out of `locate` made its unit test fail with `held.split is not a function`.

## Global Constraints

- **This goes before robertblust/mental-model takes core 0.38.0.** The plugin refuses a vault whose core is newer than the checker it bundles, so the owner's vault stops being checked the moment it pulls that upgrade with an older plugin installed. The order is: this release, installed in his vault, then the model's pull request.
- **The pin is the newest meta-model release that carries the image**: v0.42.0 when this was written. `main` there already read 0.43.0, untagged; if a later tag exists when this starts, take it and say so, since every later release carries the image too.
- **Branch and worktree:** `a-profile-shows-its-picture`, in `~/git/companygraph/obsidian-plugin-a-profile-shows-its-picture`, which holds this plan. The clone stays on `main`.
- **`export PATH=/opt/homebrew/bin:$PATH`** before `node`, `npm` or `gh`. A push names the credential helper: `git -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push -u origin a-profile-shows-its-picture`.
- **Move the pin by installing the package by name**, never by editing the line, and never install `@codemirror/state` or `@codemirror/view` by name; `AGENTS.md` says why. `test/pin.test.ts` holds the lockfile to the pin.
- **A module that imports `obsidian` cannot be loaded by the unit suite.** What is pure lives in a file of its own and is unit-tested; what faces Obsidian is held by `npm run e2e`, which this change must run before its pull request, as `AGENTS.md` requires.
- **`npm run e2e` opens a window and takes the keyboard while it runs**, on a vault copy and a user-data folder of its own; the owner's Obsidian is left alone. Say so before starting it, and do not run it while he is typing.
- **The picture is 48 CSS pixels, round, at the start of the H1's line**, `alt` the entity's name. A value with a path in it, another format, a missing file or a note without an H1 draws nothing: those are the checks' findings, not the editor's.
- **Never commit on the default branch.** Never chain a branch delete after a merge. Merging, tagging and installing into the vault each wait for the owner's word.
- **Commit messages** follow the git register, ending with a `Verified:` line and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: The checker is the image release, and the pictures reach it as bytes

Re-pinning alone turns nine tests red, because the fixture is fetched at the pinned tag and that release's example holds a PNG the test reader hands over as text. So the pin, the reader and the tests move in one task: there is no green state between them.

**Files:**

- Modify: `package.json`, `package-lock.json`, `NOTICE` (by `npm install` and `npm run notices`)
- Modify: `src/meta-model.d.ts`, `src/vault.ts`, `src/model.ts`, `src/locate.ts`, `src/entitycommands.ts`, `src/main.ts`
- Modify: `test/helpers.ts`, `test/model.test.ts`, `test/refactor.test.ts`
- Create: `test/picture.test.ts`, `e2e/picture.e2e.ts`

**Interfaces:**

- Produces: `Files` and `textOf(files: Files): Map<string, string>` from `src/model.ts`; `buildModel(files: Files, layout)`, `schemasOf(files: Files, layout)`, `locate(failure, files: Files)`; `readInstance(app, layout): Promise<Files>`; in tests, `whole(text: Map<string, string>): Files` from `test/helpers.ts`, while `example()` and `reference()` keep returning the notes alone.

- [ ] **Step 1: Move the pin and see what it breaks**

```bash
export PATH=/opt/homebrew/bin:$PATH
cd ~/git/companygraph/obsidian-plugin-a-profile-shows-its-picture
npm ci > /dev/null 2>&1; echo "install $?"
npm install companygraph-meta-model@github:companygraph/meta-model#v0.42.0 > /dev/null 2>&1; echo "re-pin $?"
node -e 'const p=require("./package-lock.json").packages["node_modules/companygraph-meta-model"];console.log(p.version,p.resolved.split("#")[1])'
gh api repos/companygraph/meta-model/commits/v0.42.0 --jq .sha
npm run -s notices; git diff --stat NOTICE | tail -1
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `0.42.0` and a sha equal to the one `gh` prints; `NOTICE` moved by one line; and `fail 9`. Each of the nine asserts that the example or a carried-out plan has no failure, and each now has one: `example/model/profiles/ai-agent/ai-agent.png: was read as text, not bytes …`.

- [ ] **Step 2: Write the failing unit tests**

Create `test/picture.test.ts`:

```ts
// R9's image in the plugin's pure parts: the map the checks take, where a failure about a
// picture lands, and what the editor draws. The reader that fills the map from a vault and the
// drawing itself face Obsidian and are held in e2e/picture.e2e.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE, example, whole } from "./helpers.ts";
import { buildModel, textOf } from "../src/model.ts";
import { locate } from "../src/locate.ts";

const AGENT = "example/model/profiles/ai-agent/ai-agent.md";
const PICTURE = "example/model/profiles/ai-agent/ai-agent.png";

test("the example passes with its picture as bytes, and fails by name with the picture as text", () => {
  assert.deepEqual(buildModel(whole(example()), EXAMPLE).failures, []);
  const asText = new Map<string, string | Uint8Array>(whole(example())).set(PICTURE, "");
  const failures = buildModel(asText, EXAMPLE).failures;
  assert.deepEqual(failures, [`${PICTURE}: was read as text, not bytes — a reader reads what IMAGE_FILE matches as bytes (R9)`]);
});

test("textOf keeps every note and drops the pictures", () => {
  const files = whole(example());
  const text = textOf(files);
  assert.ok(files.has(PICTURE) && !text.has(PICTURE));
  assert.equal(text.get(AGENT), example().get(AGENT));
  assert.equal(text.size, example().size);
});

test("a failure that leads with a picture lands on the picture, at no line, and does not throw", () => {
  const files = whole(example());
  const failure = `${PICTURE}: is 800×600; an image is square (R9)`;
  assert.deepEqual(locate(failure, files), { path: PICTURE, line: 0, message: "is 800×600; an image is square (R9)" });
});

test("a failure about the field lands on the field's line in the note", () => {
  const files = whole(example());
  const failure = `${AGENT}: \`image\` is "../x.png"; an image is a file in the page's own folder, named without a path (R9)`;
  const at = locate(failure, files);
  assert.equal(at.path, AGENT);
  assert.equal((files.get(AGENT) as string).split("\n")[at.line], "image: ai-agent.png");
});
```

Run: `node --test test/picture.test.ts 2>&1 | grep -E "SyntaxError|does not provide|^ℹ (pass|fail)"`

Expected: the file fails to load, `whole` and `textOf` not being exported yet, and `fail 1`.

- [ ] **Step 3: The map holds bytes, and only the checks see them**

Apply this to `src/` (the whole change, as the prototype's diff):

```diff
diff --git a/src/entitycommands.ts b/src/entitycommands.ts
index 905786e..d800ab6 100644
--- a/src/entitycommands.ts
+++ b/src/entitycommands.ts
@@ -7,7 +7,7 @@ import { MarkdownView, Modal, Notice, Setting, TFile } from "obsidian";
 import type { App } from "obsidian";
 import type CompanyGraphPlugin from "./main.ts";
 import { readInstance } from "./vault.ts";
-import { buildModel } from "./model.ts";
+import { buildModel, textOf } from "./model.ts";
 import { namedOf } from "./scope.ts";
 import { deletePlan, renamePlan } from "./refactor.ts";
 import type { Mention } from "./refactor.ts";
@@ -38,7 +38,7 @@ async function current(plugin: CompanyGraphPlugin, target: Named): Promise<Curre
   const named = namedOf(graph);
   const now = named.find((n) => n.path === target.path);
   if (!now) return { refused: `${target.path} is no longer an entity the model holds.` };
-  return { layout, files, named, now };
+  return { layout, files: textOf(files), named, now };
 }
 
 // Mentions counted per file, for a plan's list.
diff --git a/src/locate.ts b/src/locate.ts
index ba9f2aa..5096824 100644
--- a/src/locate.ts
+++ b/src/locate.ts
@@ -1,5 +1,7 @@
 // A failure is a string. Until the checks return a structure, this reads it: the file from the
 // path the message opens with, the line from the value or the field the message quotes.
+import type { Files } from "./model.ts";
+
 export interface Located {
   path: string | null; // null: the failure is about the instance, not one file
   line: number;        // zero-based; 0 when nothing in the message could be found in the file
@@ -54,7 +56,7 @@ function seek(lines: string[], scope: number[], values: string[]): number {
 
 const upto = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
 
-export function locate(failure: string, files: Map<string, string>): Located {
+export function locate(failure: string, files: Files): Located {
   // The file a failure opens with, found as the longest path of the map the failure leads with.
   // No pattern reads the path: Obsidian names a note "Untitled 1.md" by default, and a path with
   // a space in it is exactly the file an R12 failure is about.
@@ -64,7 +66,11 @@ export function locate(failure: string, files: Map<string, string>): Located {
       lead = path;
   if (!lead) return { path: null, line: 0, message: failure };
   const message = failure.startsWith(lead + ": ") ? failure.slice(lead.length + 2) : failure;
-  const lines = files.get(lead)!.split("\n");
+  // A failure that leads with an image is about the picture itself — its size, its format — and
+  // a picture has no line to land on: the click opens the file, which Obsidian shows.
+  const held = files.get(lead)!;
+  if (typeof held !== "string") return { path: lead, line: 0, message };
+  const lines = held.split("\n");
   const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
   const values = [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
   // A backticked token is a frontmatter field only inside the frontmatter block; a file with no
diff --git a/src/meta-model.d.ts b/src/meta-model.d.ts
index ec983af..8391853 100644
--- a/src/meta-model.d.ts
+++ b/src/meta-model.d.ts
@@ -13,8 +13,14 @@ declare module "companygraph-meta-model/checks" {
   // R9's date: a year, a year and a month, or a full date. Exported by the package since 0.32.0,
   // so nothing here keeps a second copy of it.
   export const DATE: RegExp;
+  // R9's bounds for an image, and what an image's own bytes say it is; null for anything that is
+  // neither a PNG nor a JPEG.
+  export const IMAGE_BOUNDS: { min: number; max: number; bytes: number };
+  export function imageInfoOf(bytes: unknown): { format: "png" | "jpeg"; width: number; height: number } | null;
+  // A file IMAGE_FILE matches enters the map as bytes and every other file as text (R9): an
+  // image read as text is corrupted before the check that reads its header sees it.
   export function checkInstance(
-    files: Map<string, string>,
+    files: Map<string, string | Uint8Array>,
     options?: { core?: string; model?: string },
   ): { failures: string[]; skipped: string[] };
   export function typeOfPath(rel: string, model: string): string | null;
@@ -29,6 +35,8 @@ declare module "companygraph-meta-model/checks" {
 }
 
 declare module "companygraph-meta-model/instance" {
+  // R9's image: `.jpg`, `.jpeg` or `.png`, lowercase. Every reader of an instance decides by it.
+  export const IMAGE_FILE: RegExp;
   export interface Table { caption: string | null; columns: string[]; rows: string[][] }
   export interface Section { heading: string; text: string; tables: Table[]; table?: Table }
   export interface Entity {
diff --git a/src/model.ts b/src/model.ts
index 11d6176..a653ead 100644
--- a/src/model.ts
+++ b/src/model.ts
@@ -8,6 +8,18 @@ export interface Layout {
   model: string;  // the container, e.g. "model"
 }
 
+// The vault as the checks take it: a path to its text, or to its bytes where the file is an
+// image (R9). Only the checks and `locate` read this; everything that edits a note reads `textOf`.
+export type Files = Map<string, string | Uint8Array>;
+
+// The text of a map: every file but the images, which nothing that edits a note may meet as
+// a string it could split, search or rewrite.
+export function textOf(files: Files): Map<string, string> {
+  const text = new Map<string, string>();
+  for (const [path, held] of files) if (typeof held === "string") text.set(path, held);
+  return text;
+}
+
 export interface Model {
   failures: string[];
   skipped: string[];
@@ -15,21 +27,21 @@ export interface Model {
   schemas: Map<string, string>;
 }
 
-export function schemasOf(files: Map<string, string>, layout: Layout): Map<string, string> {
+export function schemasOf(files: Files, layout: Layout): Map<string, string> {
   const schemas = new Map<string, string>();
   const prefix = layout.core + "/";
   for (const [path, text] of files)
-    if (path.startsWith(prefix) && path.endsWith("-schema.md")) schemas.set(path.slice(prefix.length), text);
+    if (typeof text === "string" && path.startsWith(prefix) && path.endsWith("-schema.md")) schemas.set(path.slice(prefix.length), text);
   return schemas;
 }
 
-export function buildModel(files: Map<string, string>, layout: Layout): Model {
+export function buildModel(files: Files, layout: Layout): Model {
   const { failures, skipped } = checkInstance(files, layout);
   const schemas = schemasOf(files, layout);
   const content = new Map<string, string>();
   const prefix = layout.model + "/";
   for (const [path, text] of files)
-    if (path.startsWith(prefix) && path.endsWith(".md")) content.set(path.slice(prefix.length), text);
+    if (typeof text === "string" && path.startsWith(prefix) && path.endsWith(".md")) content.set(path.slice(prefix.length), text);
   let graph: Graph | null = null;
   try {
     graph = parseInstance(content, { sub: prefix, schemas });
diff --git a/src/vault.ts b/src/vault.ts
index 3ce920b..f6dbc48 100644
--- a/src/vault.ts
+++ b/src/vault.ts
@@ -1,13 +1,15 @@
 // The vault as the map the parser and the checks take. The only file here that reads anything.
 import type { App } from "obsidian";
+import { IMAGE_FILE } from "companygraph-meta-model/instance";
 import { readManifest } from "./manifest.ts";
 import type { InstanceManifest } from "./manifest.ts";
-import type { Layout } from "./model.ts";
+import type { Files, Layout } from "./model.ts";
 
 export const MANIFEST = ".companygraph/manifest.json";
 
-// What is read as text. Anything else enters the map with empty text: the structure check
-// asks only whether a stray file is there, never what it holds.
+// What is read as text. An image is read as bytes, because the checks hold one from its own
+// header (R9) and text would be a corrupted picture. Anything else enters the map with empty
+// text: the structure check asks only whether a stray file is there, never what it holds.
 const TEXT = new Set(["md", "json", "txt", "yml", "yaml"]);
 
 // Obsidian keeps dot-folders out of the vault's file list, so the manifest is read through the
@@ -20,11 +22,12 @@ export async function loadManifest(app: App): Promise<InstanceManifest | null> {
 export const concerns = (path: string, layout: Layout) =>
   path.startsWith(layout.model + "/") || path.startsWith(layout.core + "/");
 
-export async function readInstance(app: App, layout: Layout): Promise<Map<string, string>> {
-  const files = new Map<string, string>();
+export async function readInstance(app: App, layout: Layout): Promise<Files> {
+  const files: Files = new Map();
   for (const file of app.vault.getFiles()) {
     if (!concerns(file.path, layout)) continue;
-    files.set(file.path, TEXT.has(file.extension) ? await app.vault.cachedRead(file) : "");
+    if (IMAGE_FILE.test(file.path)) files.set(file.path, new Uint8Array(await app.vault.readBinary(file)));
+    else files.set(file.path, TEXT.has(file.extension) ? await app.vault.cachedRead(file) : "");
   }
   return files;
 }
```

In `src/main.ts`, change `import { buildModel } from "./model.ts";` to `import { buildModel, textOf } from "./model.ts";` and, in the rebuild, `this.files = files;` to `this.files = textOf(files);`. `this.files` stays `Map<string, string>`: it is what completion, the references and the rename plans read, and none of them may meet a picture.

- [ ] **Step 4: The test reader keeps the pictures beside the notes**

Apply to `test/helpers.ts`:

```diff
diff --git a/test/helpers.ts b/test/helpers.ts
index cf4de09..f5579c0 100644
--- a/test/helpers.ts
+++ b/test/helpers.ts
@@ -2,15 +2,22 @@
 // fixture's root. scripts/fixtures.mjs fetches them; `npm test` runs it first.
 import fs from "node:fs";
 import path from "node:path";
+import { IMAGE_FILE } from "companygraph-meta-model/instance";
+import type { Files } from "../src/model.ts";
 
 const FIXTURES = path.join(import.meta.dirname, "fixtures");
 
+// A fixture's pictures, kept beside its notes and not among them: the tests edit text, and a
+// map of text is what every module but the checks takes. `whole` puts them back for the checks.
+const PICTURES = new Map<string, Uint8Array>();
+
 function readTree(root: string, folders: string[]): Map<string, string> {
   const files = new Map<string, string>();
   const walk = (rel: string) => {
     for (const entry of fs.readdirSync(path.join(root, rel))) {
       const child = `${rel}/${entry}`;
       if (fs.statSync(path.join(root, child)).isDirectory()) walk(child);
+      else if (IMAGE_FILE.test(child)) PICTURES.set(child, new Uint8Array(fs.readFileSync(path.join(root, child))));
       else files.set(child, fs.readFileSync(path.join(root, child), "utf8"));
     }
   };
@@ -18,6 +25,11 @@ function readTree(root: string, folders: string[]): Map<string, string> {
   return files;
 }
 
+// A map of notes as the vault's reader hands it to the checks: the text, and each picture the
+// fixtures hold as bytes (R9). What asserts that no check fails reads this, since a profile
+// that names a picture fails without the file.
+export const whole = (text: Map<string, string>): Files => new Map<string, string | Uint8Array>([...text, ...PICTURES]);
+
 // Where a fixture keeps its schemas and its container: the shape src/model.ts calls a Layout.
 // The meta-model's worked example: a valid instance, core at the repository root.
 export const EXAMPLE = { core: "core", model: "example/model" };
```

In `test/model.test.ts` and `test/refactor.test.ts`, add `whole` to the import from `./helpers.ts` and wrap the map of every `buildModel(…, EXAMPLE | REFERENCE | layout)` and `checkInstance(…, EXAMPLE | REFERENCE)` call in `whole(…)` — eight calls in the first file and nine in the second on the prototype. Those are the two files whose tests assert that nothing fails; the others look for one failure among many and read the notes alone as before.

- [ ] **Step 5: Run the unit suite and the typecheck**

```bash
npm run -s typecheck; echo "typecheck $?"
node --test test/picture.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Expected: `typecheck 0`; `pass 4`, `fail 0`; the whole suite with `fail 0`.

- [ ] **Step 6: Hold the reader itself, in Obsidian**

Create `e2e/picture.e2e.ts`:

```ts
// A profile's picture, read by the vault's own reader: the checks hold an image from its bytes
// (R9), and the only reader that hands them bytes here is `readInstance`, through Obsidian's
// `readBinary`. Read as text, a correct picture fails as corrupted, and no test that feeds the
// checks a map would see it. The fixture vendors a core older than the type, so the test gives
// the vault the profile schema of the release this build bundles before it names a picture.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote } from "./notes.ts";
import { command, waitForChecks } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

const META = path.join(import.meta.dirname, "..", "test", "fixtures", "meta-model");
const SCHEMA = fs.readFileSync(path.join(META, "core", "profile-schema.md"), "utf8");
// The example's own picture: a real PNG, 256 by 256, which is the floor R9 sets.
const PNG = [...fs.readFileSync(path.join(META, "example", "model", "profiles", "ai-agent", "ai-agent.png"))];
const FOLDER = PROFILE.slice(0, PROFILE.lastIndexOf("/"));

describe("a profile's picture is read as bytes", { skip }, () => {
  let session: Session;
  before(async () => { session = await start(); });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("a named PNG beside the profile passes, and the same bytes named .jpg fail by name", async () => {
    const { ui } = session;
    await ui.evaluate(async (schema: string, note: string, folder: string, bytes: number[]) => {
      await app.vault.adapter.write("meta/core/profile-schema.md", schema);
      await app.vault.createBinary(`${folder}/picture.png`, new Uint8Array(bytes).buffer);
      const file = app.vault.getAbstractFileByPath(note);
      const text = (await app.vault.read(file)) as string;
      await app.vault.modify(file, text.replace("\n---\n", "\nimage: picture.png\n---\n"));
    }, [SCHEMA, PROFILE, FOLDER, PNG]);
    await openNote(ui, PROFILE);
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to pass with a picture in the vault", "none");


    await ui.evaluate(async (note: string, folder: string) => {
      const picture = app.vault.getAbstractFileByPath(`${folder}/picture.png`);
      await app.vault.rename(picture, `${folder}/picture.jpg`);
      const file = app.vault.getAbstractFileByPath(note);
      await app.vault.modify(file, ((await app.vault.read(file)) as string).replace("image: picture.png", "image: picture.jpg"));
    }, [PROFILE, FOLDER]);
    // The rename and the note's edit are two writes, and a rebuild between them reports the
    // half-made state, so what is waited for is the one failure the finished state has.
    await command(ui, "check-now");
    await command(ui, "open-checks");
    const said = await ui.waitFor("the pane to say what the picture is", () => {
      const text = (app.workspace.getLeavesOfType("companygraph-checks")[0]?.view.contentEl as HTMLElement | undefined)?.innerText ?? "";
      return /named as/.test(text) ? text : null;
    });
    assert.match(said, /is a PNG named as a JPEG/);
    assert.doesNotMatch(said, /read as text/);
  });
});
```

The fixture vendors a core older than the type, so the test writes the bundled release's profile schema into its own vault copy before it names a picture; the plugin does not hold core to the manifest's hashes, so nothing else notices. Tell the owner the suite is about to open a window, then:

```bash
node esbuild.config.mjs > /dev/null 2>&1; echo "build $?"
node --test --test-concurrency=1 e2e/picture.e2e.ts 2>&1 | grep -E "^ℹ (pass|fail|skipped)"
```

Expected: `pass 1`, `fail 0`, `skipped 0`. Then the control: in `src/vault.ts` take out the `readBinary` line so an image falls through to the empty text it used to get, build, run the test again and see `fail 1` while it waits for checks that never come clean; put the line back, build, and see it pass. Name the control in the commit.

- [ ] **Step 7: Commit**

Commit everything this task touched. The message says the checker is the image release and why the reader had to move with it: an image read as text is a corrupted picture, and the checks now say so by name; and that only the checks and `locate` see bytes, so nothing that edits a note can meet them.

---

### Task 2: The editor draws the picture

**Files:**

- Modify: `src/vocabulary.ts` (one kind of offer, one line in `offerOf`)
- Create: `src/picture.ts` (pure), `src/picturemark.ts` (faces Obsidian)
- Modify: `src/main.ts` (one import, one registration)
- Modify: `styles.css`
- Modify: `test/picture.test.ts`, `e2e/picture.e2e.ts`

**Interfaces:**

- Consumes: `TypeVocabulary` from `src/vocabulary.ts`; `refreshNames` from `src/namelinks.ts`; `plugin.layout`, `plugin.vocabulary`.
- Produces: `Offer` gains `{ kind: "image" }`; `pictureOf(text, path, vocabulary): { file, line, name } | null` from `src/picture.ts`; `pictureMark(plugin)` from `src/picturemark.ts`; the element `img.companygraph-picture` inside the H1's line.

- [ ] **Step 1: Write the failing unit tests**

In `test/picture.test.ts`, add to the imports `import { pictureOf } from "../src/picture.ts";` and `import { vocabularyOf } from "../src/vocabulary.ts";`, and append:

```ts
const PROFILE = vocabularyOf(buildModel(whole(example()), EXAMPLE).schemas).get("profile")!;

test("the schema's image field is read as one, and nothing is offered for it", () => {
  assert.deepEqual(PROFILE.fields.find((f) => f.name === "image")?.offer, { kind: "image" });
});

test("pictureOf names the file beside the note, the H1's line and the name", () => {
  const text = example().get(AGENT)!;
  assert.deepEqual(pictureOf(text, AGENT, PROFILE), { file: PICTURE, line: text.split("\n").indexOf("# AI Agent"), name: "AI Agent" });
});

test("pictureOf draws nothing for a note without the field, a value with a path, another format, or no H1", () => {
  const text = example().get(AGENT)!;
  assert.equal(pictureOf(text.replace("image: ai-agent.png\n", ""), AGENT, PROFILE), null);
  assert.equal(pictureOf(text.replace("image: ai-agent.png", "image: ../tomas/t.png"), AGENT, PROFILE), null);
  assert.equal(pictureOf(text.replace("image: ai-agent.png", "image: ai-agent.gif"), AGENT, PROFILE), null);
  assert.equal(pictureOf(text.replace("# AI Agent", "AI Agent"), AGENT, PROFILE), null);
  assert.equal(pictureOf("# No frontmatter\n", AGENT, PROFILE), null);
});
```

Run: `node --test test/picture.test.ts 2>&1 | grep -E "ERR_MODULE_NOT_FOUND|^ℹ (pass|fail)"`

Expected: `ERR_MODULE_NOT_FOUND` for `src/picture.ts`, and `fail 1`.

- [ ] **Step 2: The vocabulary knows the field, and the pure part decides what is drawn**

Apply to `src/vocabulary.ts`:

```diff
diff --git a/src/vocabulary.ts b/src/vocabulary.ts
index 963f322..9a7cfa4 100644
--- a/src/vocabulary.ts
+++ b/src/vocabulary.ts
@@ -10,6 +10,8 @@ export type Offer =
   // names nothing is then a fact and not an error, and nothing marks it.
   | { kind: "names"; target: string; optional?: true }
   | { kind: "values"; values: string[] } // an enum's permitted values
+  // R9's `image`: a file beside the note. Nothing is offered for it; the editor draws it.
+  | { kind: "image" }
   | { kind: "none" };
 
 export interface Field { name: string; required: boolean; list: boolean; offer: Offer }
@@ -24,6 +26,7 @@ function offerOf(type: string | undefined, description: string | undefined): Off
   const decl = declarationOf(type);
   if (decl) return decl.form === "ref?" ? { kind: "names", target: decl.target, optional: true } : { kind: "names", target: decl.target };
   if (bare(type) === "enum") return { kind: "values", values: enumTokensOf(description ?? "") };
+  if (bare(type) === "image") return { kind: "image" };
   return { kind: "none" };
 }
 
```

Create `src/picture.ts`:

```ts
// The picture an entity carries, as the editor draws it: which file, on which line, under what
// name. Pure; picturemark.ts draws it. The first field the type's schema declares `image` whose
// value names a file decides it, the file sits beside the note (R9), and the line is the H1's.
import { IMAGE_FILE } from "companygraph-meta-model/instance";
import type { TypeVocabulary } from "./vocabulary.ts";

export interface Picture { file: string; line: number; name: string }

// null where the note carries no picture to draw: no frontmatter, no field declared `image` with
// a plain file name of an image in it, or no H1 to draw it on. A value with a path in it is the
// checks' finding (R9) and draws nothing.
export function pictureOf(text: string, path: string, vocabulary: TypeVocabulary): Picture | null {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const folder = path.slice(0, path.lastIndexOf("/"));
  for (const field of vocabulary.fields) {
    if (field.offer.kind !== "image") continue;
    const written = lines.slice(1, end).find((l) => l.startsWith(`${field.name}:`));
    const value = written?.slice(field.name.length + 1).trim() ?? "";
    if (!value || value.includes("/") || !IMAGE_FILE.test(value)) continue;
    const line = lines.findIndex((l, i) => i > end && l.startsWith("# "));
    if (line < 0) return null;
    return { file: `${folder}/${value}`, line, name: lines[line].slice(2).trim() };
  }
  return null;
}
```

Run: `node --test test/picture.test.ts test/vocabulary.test.ts test/candidates.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"`

Expected: `fail 0`, with `picture.test.ts` at seven passing. Nothing is offered for an image field because `candidates.ts` answers a kind it does not know with no candidates; read that function and confirm it, rather than trusting this sentence.

- [ ] **Step 3: Draw it**

Create `src/picturemark.ts`:

```ts
// The picture an entity carries, drawn where its name stands: a widget at the start of the H1's
// line, from a state field as the heading marks are, rebuilt when the text changes, when a
// rebuild sends `refreshNames` — which is when a picture added to the vault is first seen — and
// when the editor turns out to hold another file. What is drawn is decided in picture.ts.
import { editorInfoField } from "obsidian";
import { RangeSetBuilder, StateField } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { typeOfPath } from "companygraph-meta-model/checks";
import type CompanyGraphPlugin from "./main.ts";
import { pictureOf } from "./picture.ts";
import { refreshNames } from "./namelinks.ts";

class PictureWidget extends WidgetType {
  readonly src: string;
  readonly name: string;
  constructor(src: string, name: string) { super(); this.src = src; this.name = name; }
  eq(other: PictureWidget) { return other.src === this.src && other.name === this.name; }
  toDOM() {
    const img = document.createElement("img");
    img.className = "companygraph-picture";
    img.src = this.src;
    img.alt = this.name;
    img.width = 48; img.height = 48;
    return img;
  }
  ignoreEvent() { return true; }
}

interface Drawn { path: string | null; marks: DecorationSet }

const fileIn = (state: EditorState) => state.field(editorInfoField, false)?.file?.path ?? null;
const NONE = (path: string | null): Drawn => ({ path, marks: Decoration.none });

function draw(plugin: CompanyGraphPlugin, state: EditorState): Drawn {
  const path = fileIn(state);
  const layout = plugin.layout;
  if (!path || !layout) return NONE(path);
  const type = typeOfPath(path, layout.model);
  const vocabulary = type ? plugin.vocabulary.get(type) : undefined;
  if (!vocabulary) return NONE(path);
  const picture = pictureOf(state.doc.toString(), path, vocabulary);
  const file = picture ? plugin.app.vault.getFileByPath(picture.file) : null;
  if (!picture || !file) return NONE(path);
  const at = state.doc.line(picture.line + 1).from;
  const builder = new RangeSetBuilder<Decoration>();
  builder.add(at, at, Decoration.widget({ widget: new PictureWidget(plugin.app.vault.getResourcePath(file), picture.name), side: -1 }));
  return { path, marks: builder.finish() };
}

export function pictureMark(plugin: CompanyGraphPlugin) {
  return StateField.define<Drawn>({
    create: (state) => draw(plugin, state),
    update(drawn, tr: Transaction) {
      const refreshed = tr.effects.some((e) => e.is(refreshNames));
      if (tr.docChanged || refreshed || fileIn(tr.state) !== drawn.path) return draw(plugin, tr.state);
      return drawn;
    },
    provide: (field) => EditorView.decorations.from(field, (drawn) => drawn.marks),
  });
}
```

In `src/main.ts`, add `import { pictureMark } from "./picturemark.ts";` beside the import of `headingMarks`, and `this.registerEditorExtension(pictureMark(this));` directly after `this.registerEditorExtension(headingLock(this));` — before the method's first `await`, as the comment under those lines requires of every editor extension.

Append to `styles.css`:

```css
/* The picture an entity carries, at the start of its H1: round, as every page that draws it
   draws it, and sized in the heading's own line so the name does not move when it arrives. */
.companygraph-picture {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  vertical-align: middle;
  margin-right: 0.45em;
  box-shadow: 0 0 0 1px var(--background-modifier-border);
}
```

- [ ] **Step 4: Hold the drawing, in Obsidian, and look at it**

In `e2e/picture.e2e.ts`, insert directly after the line `await waitForChecks(ui, "the checks to pass with a picture in the vault", "none");`:

```ts
    // The editor draws it where the name stands: the file's own bytes, arrived, with the name
    // as its text.
    const drawn = await ui.waitFor("the picture to be drawn at the H1", () => {
      const img = document.querySelector<HTMLImageElement>(".cm-content .companygraph-picture");
      return img && img.complete && img.naturalWidth > 0
        ? { natural: img.naturalWidth, width: img.getBoundingClientRect().width, alt: img.alt, inHeading: !!img.closest(".HyperMD-header-1") }
        : null;
    });
    assert.deepEqual(drawn, { natural: 256, width: 48, alt: "Robert Blust", inHeading: true });
    if (process.env.E2E_SHOT) await ui.screenshot(process.env.E2E_SHOT);
```

```bash
npm run -s typecheck; echo "typecheck $?"
node esbuild.config.mjs > /dev/null 2>&1; echo "build $?"
E2E_SHOT=/tmp/obsidian-picture.png node --test --test-concurrency=1 e2e/picture.e2e.ts 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `typecheck 0`, `build 0`, `pass 1`, `fail 0`. Open `/tmp/obsidian-picture.png`: the picture sits round at the start of the H1, left of the name, and the Properties widget above it shows the `image` row. Send the owner the screenshot with the pull request.

- [ ] **Step 5: The whole of both suites**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run e2e 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
```

Expected: `fail 0` twice and `skipped 0`. On the prototype the e2e suite ran 42 tests.

- [ ] **Step 6: Commit**

Commit the task's files. The message says where the picture is drawn and why there, that a note in Source mode and one in Live Preview both get it because the widget belongs to the line, and that whatever the checks would fail draws nothing.

---

### Task 3: The manual, the version, the pull request

**Files:**

- Modify: `README.md` (section “What it does”)
- Modify: `package.json`, `package-lock.json`, `manifest.json` (the version)

- [ ] **Step 1: Say it in the README**

Add one paragraph to “What it does”, after the paragraph that opens `A name a schema declares as a reference is styled as a link`:

```markdown
An entity whose schema declares an `image` field, core's profile since 0.38.0, carries a picture: a JPEG or PNG beside the note, named in the frontmatter. The plugin hands the checks the file's own bytes, so a picture that is not square, is outside 256 to 1024 pixels on a side, is over 300 KB or is not the format its name says fails by name in the pane, and a click on that failure opens the picture. In the editor the picture is drawn round at the start of the note's H1, in Live Preview and in Source mode alike; a value the checks would fail draws nothing.
```

- [ ] **Step 2: The version**

A feature a vault sees, so a minor: `0.7.2` becomes `0.8.0` in `package.json` and `manifest.json` (read the numbers first and take the next minor after what they say), then `npm install --package-lock-only` so the lockfile's own version follows, and confirm with `git diff --stat` that only those three files and the README moved.

- [ ] **Step 3: Verify, commit, push, open the pull request, then stop**

```bash
npm run -s typecheck; echo "typecheck $?"
npm test > /dev/null 2>&1; echo "tests $?"
sh conventions/conventions-format > /dev/null; echo "format $?"
sh conventions/conventions-check > /dev/null; echo "prose $?"
```

Expected: four zeros. Commit, push with the credential helper, read the last two merged pull request bodies and match their shape, link companygraph/meta-model#136 and its release, attach the screenshot, and watch `gh pr checks --watch` until `test` and `conventions / conventions` report. Say in the description that `npm run e2e` ran locally and what it reported, since no job runs it. Then stop.

- [ ] **Step 4: Release and install, each on the owner's word**

After the merge and on his word: tag `0.8.0` (this repository's tags carry no `v`) on a detached `origin/main`, build, and `gh release create 0.8.0 main.js manifest.json styles.css` with notes in the shape of 0.7.2's: what reaches a vault first (the picture is checked and drawn; the bundled checker is meta-model v0.42.0 with core 0.38.0), then what a vault must do (nothing; a vault on core 0.37.0 is checked as before and says `pin differs` until it upgrades). On a further word, install it into his vault with the tooling's `obsidian` command and compare the three files with the release's assets byte for byte. Only then is robertblust/mental-model's pull request clear to merge.

---

## What this plan does not do

Completion offers nothing for an `image` field; offering the image files in the note's folder is a natural next step and is left out until someone misses it. The references pane and the compliance pane draw no picture. The fixture's pinned instance commit stays where it is: once the reference instance carries a picture, moving `INSTANCE_COMMIT` to that commit lets `e2e/picture.e2e.ts` drop the schema it writes into its vault copy, and that is a small change of its own.
