# A question row is written in the vault implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plugin bundles meta-model v0.46.0 and supports its new reference form, `ref → by <Column> in <Owner>`, where a question is written: completion, links, marks, the references pane, Rename entity and Delete entity all read a question's `## Rests on` row as the parser reads it, and the plugin is released as 0.10.0.

**Architecture:** Every place the plugin reads a reference today assumes the schema names one type and that an owned name resolves within the page's own place, through `visibleIn`; a question row does neither. The vocabulary learns three offers, `by` for the column whose type comes from its row, and `types` and `owner` for the two `string` columns that declaration reads, so a question's own columns say what they hold. `referencesIn` yields a row's `Entity` cell as a reference whose `target` is the row's `Type` cell and which carries the row's `Owner` cell and the schemas as `row`, and yields the `Owner` cell as a reference to the owning type, as a qualifier names an entity without drawing an edge. `resolveIn` hands that row to the package's `resolveRow`, which resolves within the row's owner and never through `visibleIn`, and because the pane, the marks, rename and delete all go through `referencesIn` and `resolveIn`, each of them follows the row once it passes the row along. Completion reads the row from the cell's context, which now carries every cell of its row, and every entity the model holds: the `Entity` cell offers what the package's `rowScope` narrows the row to. The rule for a row is the package's, exported in v0.46.0 as `ownerTypesOf`, `rowScope` and `resolveRow`; the plugin copies none of it.

**Tech Stack:** TypeScript run by Node's type stripping, `node:test`, esbuild, CodeMirror 6 through Obsidian, the e2e suite under `e2e/` driving a real Obsidian over the DevTools protocol.

**Spec:** `docs/superpowers/specs/2026-09-24-a-question-rests-on-the-model-design.md` in companygraph/meta-model (at `/Users/rob/git/companygraph/meta-model/`); the binding section is “The Obsidian plugin”, and “A reference whose type is read from its row” defines the form. The schema is `core/question-schema.md`, and the three exports the plugin resolves a row with are described in that repository's README, in the paragraph that opens “A `ref → by <Column> in <Owner>` row”.

Every code block in Tasks 1 to 5 was run once in a throwaway copy of `main` at df1616d with meta-model v0.46.0 installed by name and the lockfile seen to resolve its tag's commit: `npm run typecheck` is clean, `npm test` passes whole, and each new test was seen to fail at its own task's boundary exactly as each task's Step 2 says. The e2e file in Task 6 was typechecked there but not run, because the suite takes the keyboard; Task 6 runs it, and says what to expect before and after its source change.

## Global Constraints

- **Branch and worktree:** `a-question-row-is-written-in-the-vault`, in `/Users/rob/git/companygraph/obsidian-plugin-a-question-row-is-written-in-the-vault`, which holds this plan. The clone stays on `main`. Never commit on `main`.
- **`export PATH=/opt/homebrew/bin:$PATH`** before `node`, `npm` or `gh`. The remote is ssh, so a push goes to the https URL and names the credential helper: `git -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push -u https://github.com/companygraph/obsidian-plugin.git a-question-row-is-written-in-the-vault`.
- **The pin is meta-model v0.46.0**, whose tag is commit `c8d4f2b5d31c264a4d8cf26a0c1026b918122191` and whose core is 0.40.0. It also takes in v0.43.0, the CLI menu; v0.44.0, core 0.39.0's duplicate-frontmatter-key check and the fourth skill `companygraph-profile`; v0.45.0, core 0.40.0's `question` and the form; and v0.46.0, the row rule exported as `ownerTypesOf`, `rowScope` and `resolveRow`. Move it by installing the package by name, `npm install companygraph-meta-model@github:companygraph/meta-model#v0.46.0`, never by editing the line, and prove `package-lock.json` moved; `test/pin.test.ts` holds package.json's spec, the lockfile entry and the installed version together from Task 1 on. Never install `@codemirror/state` or `@codemirror/view` by name.
- **This release goes before any instance takes core 0.40.0.** An older parser throws R4 on the first question row, and the plugin refuses a vault whose core is newer than the checker it bundles, so 0.10.0 is installed in the owner's vault before robertblust/mental-model or companygraph/mental-model upgrades its core. That order is the spec's.
- **A `by` row resolves within the owner its row names and never within the page's own place** (R4, R9): the `Type` cell names a type by its schema's name without `-schema.md`; where that type is owned (R10) the `Owner` cell names the owner and the name resolves among what that owner owns; where it is not owned the `Owner` cell is blank. Backticks around a `Type`, `Entity` or `Owner` cell are not part of what it names, as the parser strips them. Anything else names nothing.
- **No rule is implemented here that the package exports.** A row is resolved by the package's `resolveRow`, the `Entity` cell's completion is the package's `rowScope`, and the owner type of a row's type is the package's `ownerTypesOf`; the plugin only reads the row's cells, bare, and hands them over. Each of the three reads the schemas again on every call and keeps nothing, so the plugin calls `ownerTypesOf` once per vocabulary load, which is once per rebuild, and `rowScope` or `resolveRow` once per `by` cell it resolves or completes: per completion request in an `Entity` cell, and per `by` cell in a pass of the marks, the references pane or a rename or delete plan, never per drawn frame. `AGENTS.md` lists the three among the package readers the plugin calls, in Task 3.
- **A module that imports `obsidian` or `@codemirror/` cannot be loaded by the unit suite.** `namelinks.ts` and `suggest.ts` change in Task 6 only, held by `e2e/question.e2e.ts`; everything else that decides lives in a pure module with its test beside it.
- **The e2e fixture is the reference instance at the commit `scripts/fixtures.mjs` names, on core 0.37.0,** and no instance carries a question yet, so `scripts/fixtures.mjs` does not change: `e2e/question.e2e.ts` writes the bundled release's `question-schema.md` and one question into its own vault copy, as `e2e/picture.e2e.ts` writes the profile schema. The unit fixture `test/fixtures/meta-model` follows the pin by itself and brings the example's three questions.
- **`npm run e2e` opens a window and takes the keyboard while it runs**, on a vault copy and a user-data folder of its own. Say so to the owner before starting it, and do not run it while he is typing.
- **TDD every task**: the test first, seen failing as the step says, then the code. At the end `npm run typecheck`, `npm test` and `npm run e2e` all pass; say “all pass”, never a count, since the counts move.
- **`sh conventions/conventions-format` and `sh conventions/conventions-check` exit 0** before every commit that touches Markdown, and at the end.
- **Prose is American English**, a paragraph on one line, in the README, `AGENTS.md`, comments, commits and the pull request.
- **Commit messages are prose**: a plain-sentence subject under 70 characters with no prefix, a prose body, a line `Verified:` naming the commands actually run, then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. After each commit `git log -1 --format='[%s]'` shows the subject alone in brackets.
- **Plugin 0.10.0, a minor**, in `manifest.json` and `package.json`, the lockfile following; the plugin has no `versions.json`. Its tags carry no `v`, because Obsidian and BRAT match the tag to the manifest's version.
- **The pull request is opened and the work stops there.** Merging, tagging 0.10.0 and installing it into a vault each wait for the owner's explicit word.

## Review Focus

1. **Backticks around a row's cells**, `` `experience` ``, `` `Mira Halvorsen` ``, as the parser's own comment says a row is written: the name resolves and is spanned without them, and completion reads the type and owner through them. Pinned in Task 3 (“backticks around a Type, Entity or Owner cell are not part of what it names, as the parser reads the row”) and Task 5 (the Entity test's `` `Tomas Reyes` `` row).
2. **A row naming a name its owner does not hold, while another owner, or the page's own place, holds it**: nothing resolves, so it is marked as naming nothing, listed under nobody and never rewritten by a rename. Pinned in Task 3 (the `inTomas` case), Task 4 (“a row naming another owner's name names nothing”, “a row naming the same name under another owner is not the renamed entity's”) and Task 6 (the unresolved mark in Obsidian).
3. **An owned type with a blank `Owner` cell, or an unowned type with a filled one**: the name resolves to nothing, and completion offers nothing for the `Entity` cell until the owner is named rather than every profile's experiences. Pinned in Task 3 (`resolveIn` with `""` and with an owner on `feature`) and Task 5 (“an owned type waits for its owner”).
4. **A `Type` cell that is blank, capitalized or names no declared type**: no crash, no resolution, nothing offered. Pinned in Task 3 (the `Experience` case and the blank `Type` row) and Task 5 (“no type, nothing to offer”).
5. **Renaming an owner, whose folder moves**: every `Owner` cell naming it is rewritten, and every row still resolves afterwards. Pinned in Task 4 (“renaming an owner rewrites every Owner cell that names it, and the rows still resolve” and “renaming any entity of the example, questions among them, leaves the checks clean”) and Task 6 (the owner renamed in Obsidian).

---

### Task 1: The checker is meta-model v0.46.0

The re-pin comes first and alone, because the checks for the form, the parser's edge and `question` in New entity all arrive with the package and need no code here; this task proves each of them. The skills test is the one thing v0.44.0 breaks: the release carries a fourth skill, and the README's “three skills” goes with it.

**Files:**

- Modify: `package.json`, `package-lock.json`, `NOTICE` (by `npm install` and `npm run notices`)
- Modify: `test/pin.test.ts`, `test/instantiate.test.ts`, `test/model.test.ts`, `test/locate.test.ts`, `test/links.test.ts`, `test/scaffold.test.ts`, `README.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `test/fixtures/meta-model` at v0.46.0, whose `example/model/questions/` holds `who-split-billing-out-of-the-monolith.md` (one row, `experience` “Splitting the billing domain” owned by `profile` “Mira Halvorsen”), `how-do-i-find-out-why-a-line-is-on-my-invoice.md` (two rows of the unowned `feature`) and `does-beacon-systems-publish-its-revenue.md` (no rows); and `core/question-schema.md`. Every later task's tests read these.

- [ ] **Step 1: Install and see the suite green on v0.42.0**

```bash
export PATH=/opt/homebrew/bin:$PATH
cd /Users/rob/git/companygraph/obsidian-plugin-a-question-row-is-written-in-the-vault
npm ci > /dev/null 2>&1; echo "install $?"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `install 0` and `fail 0`.

- [ ] **Step 2: Hold the lockfile to the pin, and see the test catch a lockfile left behind**

In `test/pin.test.ts`, inside the first test, directly after the line `assert.equal(installed, tag, "install the package by name so the lockfile moves with the pin");`, insert:

```ts
  // The lockfile is what `npm ci` installs, in CI and in a fresh clone: a pin moved by hand
  // leaves it on the old release while the working tree's install says the new one.
  const locked = read("package-lock.json").packages["node_modules/companygraph-meta-model"];
  assert.equal(locked.version, tag, "package-lock.json installs another release than the pin names");
  assert.match(locked.resolved, /^git\+ssh:\/\/git@github\.com\/companygraph\/meta-model\.git#[0-9a-f]{40}$/, "the lockfile resolves the pin to one commit");
  assert.equal(read("package-lock.json").packages[""].dependencies["companygraph-meta-model"], pin, "the lockfile's own copy of the pin");
```

Run it on the pin as it stands, then on a lockfile set back by hand, then put the lockfile back:

```bash
node --test test/pin.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
node -e 'const fs=require("fs");const l=JSON.parse(fs.readFileSync("package-lock.json"));l.packages["node_modules/companygraph-meta-model"].version="0.41.0";fs.writeFileSync("package-lock.json",JSON.stringify(l,null,2)+"\n")'
node --test test/pin.test.ts 2>&1 | grep -E "package-lock.json installs another release|^ℹ (pass|fail)"
git checkout package-lock.json
```

Expected: `pass 4`, `fail 0`; then the message `package-lock.json installs another release than the pin names` and `fail 1`; and the lockfile back as it was.

- [ ] **Step 3: Move the pin by name and prove the lockfile moved**

```bash
npm install companygraph-meta-model@github:companygraph/meta-model#v0.46.0 > /dev/null 2>&1; echo "re-pin $?"
grep '"companygraph-meta-model"' package.json
node -e 'const p=require("./package-lock.json").packages["node_modules/companygraph-meta-model"];console.log(p.version,p.resolved)'
gh api repos/companygraph/meta-model/commits/v0.46.0 --jq .sha
node -e 'console.log(require("./node_modules/companygraph-meta-model/package.json").version)'
npm run -s notices; git diff --stat
```

Expected: `re-pin 0`; `"companygraph-meta-model": "github:companygraph/meta-model#v0.46.0",`; `0.46.0 git+ssh://git@github.com/companygraph/meta-model.git#c8d4f2b5d31c264a4d8cf26a0c1026b918122191`; the same sha from `gh`; `0.46.0` installed; `NOTICE written: …`, and `NOTICE`, `package-lock.json` and `package.json` the only files moved besides `test/pin.test.ts`.

- [ ] **Step 4: See what the four releases break**

```bash
npm run -s typecheck; echo "typecheck $?"
npm test 2>&1 | grep -E "^✖ |^ℹ (pass|fail)" | sort -u
```

`npm test` fetches the meta-model fixture at the new tag first. Expected: `typecheck 0`, and one failure, `the release the build carries is the one installed: its version, its core and Claude's three skills`, whose diff shows `'companygraph-profile'` among the skills. Nothing else fails: the example's three questions parse and pass the checks, and today the plugin reads a `by` column as a declaration of no type it knows, so it offers, marks and resolves nothing there rather than throwing.

One thing v0.46.0 changes that the plugin could see: the parser's R4 text for a row whose `Type` cell is empty now reads `has no type in its row` where it read `is of type "", which no schema declares`. The plugin shows a parser message only when the checks found nothing and the parser threw all the same (`buildModel`), no test here quotes either text, and `grep -rn 'which no schema declares' src test/*.ts e2e` finds nothing, so nothing moves with it.

- [ ] **Step 5: The skills are the release's, whatever their number**

In `test/instantiate.test.ts`, replace the test that opens `test("the release the build carries is the one installed` with:

```ts
test("the release the build carries is the one installed: its version, its core and Claude's skills", () => {
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.ok(release.core["CONVENTIONS.md"] && release.core["manifest.json"]);
  assert.ok(release.core["question-schema.md"], "core 0.40.0 carries the question");
  // The skills are the tooling's and move with it; meta-model v0.44.0 added the profile's.
  const skills = new Set(Object.keys(release.skills).map((p) => p.split("/")[0]));
  assert.deepEqual([...skills].sort(), ["companygraph-export", "companygraph-profile", "companygraph-surface", "companygraph-validate"]);
});
```

In `README.md`, in the paragraph that opens `` `CompanyGraph: Make this vault an instance` ``, replace `` Claude's `AGENTS.md`, `CLAUDE.md` and three skills. `` with `` Claude's `AGENTS.md`, `CLAUDE.md` and the skills the release carries. ``

Run: `node --test test/instantiate.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"`

Expected: `fail 0`.

- [ ] **Step 6: Hold what the re-pin brought: the checks, the edge and New entity**

These tests need no source change and pass on this re-pin; on v0.42.0 they throw, since the fixture's example has no questions. They are here so that a later release that drops any of it fails a test by name.

Append to `test/model.test.ts`:

```ts
// Core 0.40.0: the checks the re-pin brings hold a question's row cell by cell (R4, R9), and the
// plugin reports what they say; the parser's own throw on the same row is dropped, as for any row.
const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";

test("a question row naming an owner that is not there fails by name, and the graph does not parse", () => {
  const m = buildModel(whole(edited(example(), WHO, (t) => t.replace("| Mira Halvorsen |", "| Mira Nobody |"))), EXAMPLE);
  assert.equal(m.graph, null);
  assert.deepEqual(m.failures, [`${WHO}: \`Entity\` in "## Rests on" names "Mira Nobody" as its owner, which names no profile in example/model/ (R4)`]);
});

test("a question row whose type is owned and whose owner is blank fails by name", () => {
  const m = buildModel(whole(edited(example(), WHO, (t) => t.replace("| Mira Halvorsen |", "| |"))), EXAMPLE);
  assert.equal(m.failures.length, 1);
  assert.match(m.failures[0], /which a profile owns, and the row names no profile \(R4\)$/);
});
```

In `test/locate.test.ts`, change the import from `./helpers.ts` to `import { example, EXAMPLE, edited, whole } from "./helpers.ts";` and append:

```ts
// Core 0.40.0: a failure about a question's row quotes the cell it is about, and lands on its row.
test("a failure about a question row lands on that row", () => {
  const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";
  const files = edited(example(), WHO, (t) => t.replace("| Mira Halvorsen |", "| Mira Nobody |"));
  const failures = buildModel(whole(files), EXAMPLE).failures;
  assert.equal(failures.length, 1);
  const at = locate(failures[0], files);
  assert.equal(at.path, WHO);
  assert.equal(files.get(WHO)!.split("\n")[at.line], "| experience | Splitting the billing domain | Mira Nobody | the period |");
});
```

Append to `test/links.test.ts`:

```ts
// Core 0.40.0: a question's row draws its edge, `Rests on.Entity`, so the graph view links the
// question to what it rests on; the Owner cell draws none, as a qualifier draws none.
test("a question links to each entity it rests on, and not to the owner its row names", () => {
  const links = linksOf(graph);
  const who = links["example/model/questions/who-split-billing-out-of-the-monolith.md"];
  assert.deepEqual(Object.keys(who).filter((p) => !p.includes("/sources/")), ["example/model/profiles/mira-halvorsen/experiences/2022-beacon-systems.md"]);
  assert.equal(links["example/model/questions/does-beacon-systems-publish-its-revenue.md"]?.["example/model/sources/local.md"], 1, "a question resting on nothing names its source alone");
});
```

Append to `test/scaffold.test.ts`:

```ts
// Core 0.40.0: `question` is a type of the package's own list and has a schema, so New entity
// offers it from anywhere, as a concept is, and its scaffold is what the schema requires.
test("a question is offered from anywhere, named by the slug of its question, and its scaffold passes the checks", () => {
  const question = byType(targetsFor(MODEL, null, none)).get("question")!;
  assert.equal(question.where, "model/questions/");
  assert.equal(question.pathFor("Who split billing out of the monolith?"), "model/questions/who-split-billing-out-of-the-monolith.md");
  assert.ok(byType(targetsFor(MODEL, "model/profiles/robert-blust/robert-blust.md", none)).has("question"));
  const { text } = scaffoldOf(vocabulary.get("question")!, "Who wrote the pricing rules?", { source: "Local" });
  assert.ok(!text.includes("## Rests on"), "an optional section is the author's to add");
  const files = example();
  const path = "example/model/questions/who-wrote-the-pricing-rules.md";
  files.set(path, text.replace("> \n", "> The pricing rules say who owns them.\n"));
  assert.deepEqual(checkInstance(files, EXAMPLE).failures.filter((f) => f.startsWith(path)), []);
});
```

Run: `node --test test/model.test.ts test/locate.test.ts test/links.test.ts test/scaffold.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"`

Expected: `fail 0`. New entity's list is `targetsFor`, filtered by the types the vault's core has a schema for (`src/newentity.ts`, `getItems`), so `question` is offered in any vault whose core carries its schema, with no code here; read those two functions and confirm it rather than trusting this sentence.

- [ ] **Step 7: Check and commit**

```bash
npm run -s typecheck; echo "typecheck $?"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
sh conventions/conventions-format > /dev/null; echo "format $?"
sh conventions/conventions-check > /dev/null; echo "prose $?"
git add package.json package-lock.json NOTICE README.md test/pin.test.ts test/instantiate.test.ts test/model.test.ts test/locate.test.ts test/links.test.ts test/scaffold.test.ts
git commit -F - <<'EOF'
The checker is meta-model v0.46.0, which knows the question

The pin moves from v0.42.0 to v0.46.0, installed by name, and takes four releases in: the CLI menu in v0.43.0, the duplicate frontmatter key check and the profile skill in v0.44.0, core 0.40.0's question with its reference form `ref → by <Column> in <Owner>` in v0.45.0, and in v0.46.0 the rule that resolves such a row, exported for the plugin to call. The pin test now holds package.json's spec, the lockfile's entry and the installed package together, since a lockfile left behind builds green on the older release; it was seen failing on a lockfile set back by hand.

The checks for the form, the edge a question row draws and `question` in New entity all arrive with the package, and new tests hold each of them here: a row naming an owner that is not there fails by name and lands on its row, the graph view links a question to what it rests on and not to its owner, and a question's scaffold passes the checks. The release carries a fourth skill, so the skills test and the README stop counting them.

Verified: npm run typecheck, npm test (all pass), node --test test/pin.test.ts failing on a lockfile set back by hand, sh conventions/conventions-format and sh conventions/conventions-check exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
```

Expected: `typecheck 0`, `fail 0`, `format 0`, `prose 0`, and `[The checker is meta-model v0.46.0, which knows the question]`.

### Task 2: The vocabulary reads a type from the row

**Files:**

- Modify: `src/meta-model.d.ts`, `src/vocabulary.ts`
- Test: `test/vocabulary.test.ts`

**Interfaces:**

- Consumes: from `companygraph-meta-model/instance`, `declarationOf`, which returns `{ form: "ref", target: null, by: string, in: string | null }` for the form and `{ form, target }` otherwise, and `ownerTypesOf(schemas: Map<string, string>): Map<string, string>`, every owned type mapped to its owner type.
- Produces, in `src/meta-model.d.ts`: the declaration's union, and the types of `ownerTypesOf`, `rowScope` and `resolveRow` with `RowEntity` (`{ type, name, path }`, which the plugin's `Named` fits) and `RowError` (`{ error: string; subject: "value" | "owner" }`); `rowScope` returns `{ within }` or a `RowError`, `resolveRow` `{ entity }` or a `RowError`. In `src/vocabulary.ts`: the `Offer` kinds `{ kind: "by"; by: string; in: string | null; schemas: Map<string, string> }` for the column whose type comes from its row, carrying the schemas the vocabulary was read from, which `rowScope` and `resolveRow` take; `{ kind: "types"; types: string[] }` for the column its `by` names, every type the schemas declare, sorted; and `{ kind: "owner"; by: string; owners: Map<string, string> }` for the column its `in` names, `owners` being `ownerTypesOf(schemas)`, read once per `vocabularyOf` call; a field or a grouped heading declared `by` offers `{ kind: "none" }`; and `export const bare: (cell: string | undefined) => string`, a cell with its backticks off and trimmed. A question's `## Rests on` columns read `Type` → `types`, `Entity` → `by`, `Owner` → `owner`, `For` → `none`. Task 3 is the first to call `rowScope` and `resolveRow`; they are declared here with `ownerTypesOf` so the three sit together.

- [ ] **Step 1: Write the failing tests**

Append to `test/vocabulary.test.ts`:

```ts
// Core 0.40.0 (meta-model v0.45.0): `ref → by <Column> in <Owner>` reads the type of the name from
// the row, and the owner too where that type is owned (R4, R9). The two columns it reads are
// declared `string`, and what they hold is read from the declaration that reads them.
const REFERENCE_BY = "ref → by Type in Owner";

test("a question's Rests on reads its entity's type and owner from the row", () => {
  const schemas = schemasOf(example(), EXAMPLE);
  const rests = vocabulary.get("question")!.sections.find((s) => s.heading === "Rests on")!;
  assert.deepEqual(rests.columns, [
    { name: "Type", offer: { kind: "types", types: [...vocabulary.keys()].sort((a, b) => a.localeCompare(b)) } },
    { name: "Entity", offer: { kind: "by", by: "Type", in: "Owner", schemas } },
    { name: "Owner", offer: { kind: "owner", by: "Type", owners: ownerTypesOf(schemas) } },
    { name: "For", offer: { kind: "none" } },
  ]);
  const owner = rests.columns![2].offer;
  assert.ok(owner.kind === "owner" && owner.owners.get("experience") === "profile" && !owner.owners.has("feature"));
});

test("a `by` with no `in` leaves the owner column a string, and a `by` on a field offers nothing", () => {
  const schemas = schemasOf(example(), EXAMPLE);
  const question = schemas.get("question-schema.md")!;
  assert.ok(question.includes(REFERENCE_BY) && question.includes("| `source-id` | No | string |"));
  const bare = vocabularyOf(new Map(schemas).set("question-schema.md", question.replace(REFERENCE_BY, "ref → by Type")));
  const rests = bare.get("question")!.sections.find((s) => s.heading === "Rests on")!;
  assert.deepEqual(rests.columns!.map((c) => c.offer.kind), ["types", "by", "none", "none"]);
  assert.ok(rests.columns![1].offer.kind === "by" && rests.columns![1].offer.in === null);
  const field = vocabularyOf(new Map(schemas).set("question-schema.md", question.replace("| `source-id` | No | string |", "| `source-id` | No | ref → by Type |")));
  assert.deepEqual(field.get("question")!.fields.find((f) => f.name === "source-id")!.offer, { kind: "none" });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vocabulary.test.ts 2>&1 | grep -E "^✖ |^ℹ (pass|fail)" | sort -u`

Expected: `fail 2`, the two new tests; today the `Entity` column reads as `{ kind: "names", target: null }`, a declaration of no type.

- [ ] **Step 3: Type the declaration as the package returns it, and let the type check find its reader**

Apply to `src/meta-model.d.ts` the first file of the diff in Step 4, then run `npm run -s typecheck`.

Expected: one error, `src/vocabulary.ts(27,117): error TS2322: Type 'string | null' is not assignable to type 'string'.` That is the one place in `src/` that reads a declaration's `target`, which `grep -n "declarationOf" src/*.ts` confirms; every other `.target` under `src/` is a `Reference`'s, handled in Task 3.

- [ ] **Step 4: Read the form**

Apply this diff (save it to a file and run `git apply` on it, or edit to match):

```diff
diff --git a/src/meta-model.d.ts b/src/meta-model.d.ts
index 8391853..74ba9ba 100644
--- a/src/meta-model.d.ts
+++ b/src/meta-model.d.ts
@@ -47,8 +47,28 @@ declare module "companygraph-meta-model/instance" {
   export interface Graph { entities: Entity[]; edges: unknown[]; types: unknown[]; root: string; rootId: string | null }
   export function parseInstance(files: Map<string, string>, options: { sub?: string; schemas: Map<string, string> }): Graph;
   export function parseSchemas(files: Map<string, string>, options?: { sub?: string }): Graph;
-  export interface Declaration { form: "ref" | "ref?" | "qualifier"; target: string }
+  // A declaration names its type, or, in the form `ref → by <Column> in <Owner>` (R4, R9), reads
+  // it from its row: `target` is then null, and `by` and `in` name the columns of the same table
+  // that carry the type and the owner, `in` null where the form has none.
+  export type Declaration =
+    | { form: "ref" | "ref?" | "qualifier"; target: string; by?: undefined; in?: undefined }
+    | { form: "ref"; target: null; by: string; in: string | null };
   export function declarationOf(cell: string | undefined): Declaration | null;
+  // A `ref → by <Column> in <Owner>` row (R4, R9), resolved by the rule the parser resolves it
+  // by. `schemas` is keyed `<type>-schema.md`; an entity needs only `{ type, name, path }`; the
+  // row's cells are passed bare. Each call reads the schemas again and keeps nothing.
+  export interface RowEntity { type: string; name: string; path: string }
+  export type RowError = { error: string; subject: "value" | "owner" };
+  // Every owned type mapped to its owner type, from the schemas' `**Owner:**` lines (R10).
+  export function ownerTypesOf(schemas: Map<string, string>): Map<string, string>;
+  // What a row's Type and Owner cells narrow the entities down to.
+  export function rowScope<E extends RowEntity>(entities: E[], schemas: Map<string, string>, row: { type: string; owner?: string }):
+    | { within: E[]; error?: undefined }
+    | (RowError & { within?: undefined });
+  // The one entity a row's name names within that scope.
+  export function resolveRow<E extends RowEntity>(entities: E[], schemas: Map<string, string>, row: { type: string; name: string; owner?: string }):
+    | { entity: E; error?: undefined }
+    | (RowError & { entity?: undefined });
 }
 
 declare module "companygraph-meta-model/plan" {
diff --git a/src/vocabulary.ts b/src/vocabulary.ts
index 9a7cfa4..b44cd0f 100644
--- a/src/vocabulary.ts
+++ b/src/vocabulary.ts
@@ -1,7 +1,7 @@
 // What each type's schema declares, in the shape completion asks for. Every Type cell goes
 // through the package's one reader, declarationOf, and every enum's values through
 // enumTokensOf; this file reads tables by their column names and interprets nothing.
-import { parseSchemas, declarationOf } from "companygraph-meta-model/instance";
+import { parseSchemas, declarationOf, ownerTypesOf } from "companygraph-meta-model/instance";
 import type { Table } from "companygraph-meta-model/instance";
 import { enumTokensOf, COLUMN_CAPTION, HEADING_CAPTION } from "companygraph-meta-model/checks";
 
@@ -12,6 +12,16 @@ export type Offer =
   | { kind: "values"; values: string[] } // an enum's permitted values
   // R9's `image`: a file beside the note. Nothing is offered for it; the editor draws it.
   | { kind: "image" }
+  // `ref → by <Column> in <Owner>` (R4, R9): the names of the type the same row's `by` cell
+  // names, within the owner its `in` cell names where that type is owned, resolved by the
+  // package's `rowScope` and `resolveRow` against `schemas`, the map the vocabulary was read
+  // from. Legal in a column table only; a field declared so is the checks' finding.
+  | { kind: "by"; by: string; in: string | null; schemas: Map<string, string> }
+  // The column a `by` column reads its type from: every type the vault's core declares, sorted.
+  | { kind: "types"; types: string[] }
+  // The column a `by … in` column reads its owner from: the names of the type that owns the type
+  // the same row's `by` cell names, looked up in `owners`, the package's `ownerTypesOf`.
+  | { kind: "owner"; by: string; owners: Map<string, string> }
   | { kind: "none" };
 
 export interface Field { name: string; required: boolean; list: boolean; offer: Offer }
@@ -20,30 +30,53 @@ export interface Column { name: string; offer: Offer }
 export interface SectionDecl { heading: string; required: boolean; columns: Column[] | null; grouped?: Offer | null }
 export interface TypeVocabulary { fields: Field[]; sections: SectionDecl[] }
 
-const bare = (cell: string | undefined) => (cell ?? "").replace(/`/g, "").trim();
+// A cell as the package reads a schema's cells and a `by` row's type and owner: backticks off, trimmed.
+export const bare = (cell: string | undefined) => (cell ?? "").replace(/`/g, "").trim();
 
-function offerOf(type: string | undefined, description: string | undefined): Offer {
+function offerOf(type: string | undefined, description: string | undefined, schemas: Map<string, string>): Offer {
   const decl = declarationOf(type);
+  if (decl?.by !== undefined) return { kind: "by", by: decl.by, in: decl.in, schemas };
   if (decl) return decl.form === "ref?" ? { kind: "names", target: decl.target, optional: true } : { kind: "names", target: decl.target };
   if (bare(type) === "enum") return { kind: "values", values: enumTokensOf(description ?? "") };
   if (bare(type) === "image") return { kind: "image" };
   return { kind: "none" };
 }
 
+// A `by` needs a row to read its type from, and a field or a `###` heading has none (R9): the
+// checks say so, and nothing is offered for it.
+const rowless = (offer: Offer): Offer => (offer.kind === "by" ? { kind: "none" } : offer);
+
+// The columns a `by` column reads are declared `string`, and what they hold is read from the
+// `by` declaration: its `by` column holds a type, its `in` column the owner. A column the
+// declaration names that declares an offer of its own keeps it; the checks fail that schema.
+// `types` and `owners` are read once per vocabulary, which is once per rebuild.
+function rowRead(columns: Column[], types: string[], owners: Map<string, string>): Column[] {
+  const read = new Map<string, Offer>();
+  for (const c of columns)
+    if (c.offer.kind === "by") {
+      read.set(c.offer.by, { kind: "types", types });
+      if (c.offer.in) read.set(c.offer.in, { kind: "owner", by: c.offer.by, owners });
+    }
+  return columns.map((c) => (c.offer.kind === "none" && read.has(c.name) ? { ...c, offer: read.get(c.name)! } : c));
+}
+
 // One row of a schema table as an object keyed by the table's own column names.
 const rowsOf = (table: Table | undefined) =>
   (table?.rows ?? []).map((row) => Object.fromEntries(table!.columns.map((c, i) => [c, row[i]])));
 
 export function vocabularyOf(schemas: Map<string, string>): Map<string, TypeVocabulary> {
   const vocabulary = new Map<string, TypeVocabulary>();
-  for (const e of parseSchemas(schemas).entities) {
+  const entities = parseSchemas(schemas).entities;
+  const types = entities.map((e) => e.id.slice("core/".length)).sort((a, b) => a.localeCompare(b));
+  const owners = ownerTypesOf(schemas);
+  for (const e of entities) {
     const type = e.id.slice("core/".length);
     const frontmatter = e.sections.find((s) => s.heading === "Frontmatter");
     const fields = rowsOf(frontmatter?.table).map((r) => ({
       name: bare(r.Field),
       required: bare(r.Required) === "Yes",
       list: bare(r.Type).startsWith("array of "),
-      offer: offerOf(r.Type, r.Description),
+      offer: rowless(offerOf(r.Type, r.Description, schemas)),
     }));
 
     const tables = e.sections.find((s) => s.heading === "Sections")?.tables ?? [];
@@ -51,13 +84,13 @@ export function vocabularyOf(schemas: Map<string, string>): Map<string, TypeVoca
     for (const t of tables) {
       const section = t.caption?.match(COLUMN_CAPTION)?.[1];
       if (!section) continue;
-      columnsBySection.set(section.trim(), rowsOf(t).map((r) => ({ name: bare(r.Column), offer: offerOf(r.Type, r.Description) })));
+      columnsBySection.set(section.trim(), rowRead(rowsOf(t).map((r) => ({ name: bare(r.Column), offer: offerOf(r.Type, r.Description, schemas) })), types, owners));
     }
     const groupedBySection = new Map<string, Offer>();
     for (const t of tables) {
       const section = t.caption?.match(HEADING_CAPTION)?.[1];
       const row = rowsOf(t)[0];
-      if (section && row) groupedBySection.set(section.trim(), offerOf(row.Type, row.Description));
+      if (section && row) groupedBySection.set(section.trim(), rowless(offerOf(row.Type, row.Description, schemas)));
     }
     const index = tables.find((t) => !t.caption);
     const sections = rowsOf(index)
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
npm run -s typecheck; echo "typecheck $?"
node --test test/vocabulary.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `typecheck 0` and `fail 0` both times. A field never carries the three new kinds, since `rowless` turns a `by` field into `none`, so the Properties widget, the picture and the frontmatter marks are untouched; and the table readers, `targetOf` in `references.ts` and `offered` in `candidates.ts`, answer a kind they do not know with nothing until Tasks 3 and 5 give these a meaning. `grep -n "offer.kind" src/*.ts` shows every switch.

- [ ] **Step 6: Commit**

```bash
git add src/meta-model.d.ts src/vocabulary.ts test/vocabulary.test.ts
git commit -F - <<'EOF'
The vocabulary reads a question row's type from the row

A column declared `ref → by <Column> in <Owner>` names no type: its row does, in the column its `by` names, and where that type is owned, the owner in the column its `in` names. The vocabulary now reads it as an offer of its own, carrying the schemas the package's row resolver takes, and reads the two columns it names, which the schema declares `string`, as the column of types and the column of owners, the latter with the package's `ownerTypesOf` read once per vocabulary, so a question's `## Rests on` says what each of its columns holds. A field or a grouped heading declared that way has no row to read from; the checks fail such a schema, and nothing is offered for it here.

The package's declaration type moved with it: `target` is null for the form, and the type check found the one reader in the plugin that assumed a string. The types of the three row exports are declared beside it.

Verified: npm run typecheck, npm test (all pass), the two new vocabulary tests seen failing first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
```

Expected: `[The vocabulary reads a question row's type from the row]`.

### Task 3: A question row names an entity within its row's owner

**Files:**

- Modify: `src/references.ts`, `AGENTS.md`
- Test: `test/references.test.ts`

**Interfaces:**

- Consumes: `bare` and the `Offer` kinds `by` (with `schemas`) and `owner` (with `owners`) from Task 2; `resolveRow(entities, schemas, { type, name, owner })` from `companygraph-meta-model/instance`, typed in Task 2.
- Produces, in `src/references.ts`: `Reference` gains `row?: { owner: string; schemas: Map<string, string> }`, set on an `Entity` cell only, `owner` being the row's `Owner` cell bare (`""` where blank); its `target` is then the row's `Type` cell bare (`""` where blank); the row's `Owner` cell is a `Reference` of its own with `target` the owning type, `owners.get(type)`, and no `row`; `resolveIn(named, path, model, target, name, row?: Reference["row"]): string | null` resolves by `resolveRow` when `row` is given and through `visibleIn` otherwise. The plugin's own `scope.ts` does not change.

- [ ] **Step 1: Write the failing tests**

Append to `test/references.test.ts`:

```ts
// A question's Rests on (core 0.40.0): the Entity cell names an entity of the type its row's
// Type cell names, within the owner its Owner cell names where that type is owned, and the page's
// own place is never consulted (R4, R9). The Owner cell names that owner, as a qualifier names an
// entity: a reference with no edge of its own.
const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";
const HOW = "example/model/questions/how-do-i-find-out-why-a-line-is-on-my-invoice.md";
const question = vocabulary.get("question")!;
const rowsOf = (text: string) => {
  const found = text.split("\n");
  return referencesIn(found, question).map((r) => [r.name, r.target, r.row?.owner, r.declared, found[r.line].slice(r.from, r.to)]);
};

test("a question row is a reference to the entity it names, carrying the owner its row names", () => {
  assert.deepEqual(rowsOf(files.get(WHO)!).slice(1), [
    ["Splitting the billing domain", "experience", "Mira Halvorsen", "## Rests on · Entity", "Splitting the billing domain"],
    ["Mira Halvorsen", "profile", undefined, "## Rests on · Owner", "Mira Halvorsen"],
  ]);
  assert.deepEqual(rowsOf(files.get(HOW)!).slice(1).map((r) => r.slice(0, 3)), [
    ["Charge explanation", "feature", ""],
    ["Pricing rules", "feature", ""],
  ]);
});

test("a question row's name resolves within the owner its row names, never within the page's place", () => {
  const schemas = schemasOf(files, EXAMPLE);
  const within = (name: string, type: string, owner: string) => resolveIn(named, WHO, EXAMPLE.model, type, name, { owner, schemas });
  assert.match(within("Splitting the billing domain", "experience", "Mira Halvorsen")!, /mira-halvorsen\/experiences\//);
  assert.equal(within("Splitting the billing domain", "experience", "Tomas Reyes"), null, "another owner's row");
  assert.equal(within("Splitting the billing domain", "experience", ""), null, "an owned type with no owner named");
  assert.equal(within("Charge explanation", "feature", ""), "example/model/features/charge-explanation.md");
  assert.equal(within("Charge explanation", "feature", "Mira Halvorsen"), null, "an unowned type with an owner named");
  assert.equal(within("Charge explanation", "", ""), null, "a blank Type cell names no type");
  assert.equal(within("Splitting the billing domain", "Experience", "Mira Halvorsen"), null, "a type is its schema's name, as written");
  assert.equal(within("Splitting the billing domain", "experience", "Nobody"), null, "an owner that is not there");
  // Written inside Tomas's own folder, a name of an owned type is his by the page's place; a row
  // that names Mira still resolves within Mira.
  const inTomas = "example/model/profiles/tomas-reyes/tomas-reyes.md";
  assert.match(resolveIn(named, inTomas, EXAMPLE.model, "experience", "Splitting the billing domain", { owner: "Mira Halvorsen", schemas })!, /mira-halvorsen\//);
  assert.equal(resolveIn(named, inTomas, EXAMPLE.model, "experience", "Splitting the billing domain"), null);
});

test("backticks around a Type, Entity or Owner cell are not part of what it names, as the parser reads the row", () => {
  const row = "| `experience` | `Splitting the billing domain` | `Mira Halvorsen` | the period |";
  const text = files.get(WHO)!.replace(/^\| experience \|.*$/m, row);
  assert.deepEqual(rowsOf(text).slice(1).map((r) => [r[0], r[1], r[2], r[4]]), [
    ["Splitting the billing domain", "experience", "Mira Halvorsen", "Splitting the billing domain"],
    ["Mira Halvorsen", "profile", undefined, "Mira Halvorsen"],
  ]);
});

test("an empty Entity cell is no reference, a blank Type cell leaves no type, and an unowned type's Owner cell is no reference", () => {
  const text = [
    "---", "source: Local", "---", "", "# Q?", "", "> A.", "", "## Rests on", "",
    "| Type | Entity | Owner | For |", "| --- | --- | --- | --- |",
    "| experience |  | Mira Halvorsen | |",
    "|  | Charge explanation | | |",
    "| feature | Charge explanation | Mira Halvorsen | |",
  ].join("\n");
  assert.deepEqual(rowsOf(text).slice(1).map((r) => r.slice(0, 3)), [
    ["Mira Halvorsen", "profile", undefined],
    ["Charge explanation", "", ""],
    ["Charge explanation", "feature", "Mira Halvorsen"],
  ]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/references.test.ts 2>&1 | grep -E "^✖ |^ℹ (pass|fail)" | sort -u`

Expected: the four new tests fail, since today no cell of the `by` column is read as a reference and `resolveIn` takes no row. (`npm run -s typecheck` also names the test's `row?.owner` and its object arguments to `resolveIn`, which Step 3 makes true.)

- [ ] **Step 3: Resolve a row by the package's rule**

Apply this diff:

```diff
diff --git a/src/references.ts b/src/references.ts
index 00d8760..25b8730 100644
--- a/src/references.ts
+++ b/src/references.ts
@@ -4,7 +4,9 @@
 // Obsidian-facing modules' business. A qualifier counts as much as a reference, since both name
 // an entity; what differs is only whether the model draws an edge, which is links.ts's concern.
 import { tableOf } from "companygraph-meta-model/checks";
+import { resolveRow } from "companygraph-meta-model/instance";
 import { frontmatterEnd } from "./context.ts";
+import { bare } from "./vocabulary.ts";
 import type { TypeVocabulary } from "./vocabulary.ts";
 import { visibleIn } from "./scope.ts";
 import type { Named } from "./scope.ts";
@@ -14,11 +16,18 @@ export interface Reference {
   from: number;   // the name's first character on that line
   to: number;     // one past its last
   name: string;
-  target: string; // the type the declaration names
+  // The type the declaration names; for a cell of a `ref → by` column, the type its row's `by`
+  // cell names, "" where that cell is blank; for the owner cell of such a row, the type that owns it.
+  target: string;
   optional: boolean; // declared `ref?`: a value that names nothing is a fact, not a broken name
   // What declares it, in the schema's words: a field's name, `## Section · Column` for a cell,
   // `## Section` for the heading of a grouped section. A references list says it beside the name.
   declared: string;
+  // Set on a cell of a `ref → by <Column> in <Owner>` column only (R4, R9): the owner its row's
+  // `in` cell names, "" where it is blank or the form has no `in`, and the schemas the row is
+  // read against. Such a name resolves by the package's `resolveRow`, within that owner and never
+  // within the page's own place, as the parser resolves it.
+  row?: { owner: string; schemas: Map<string, string> };
 }
 
 type Offer = TypeVocabulary["fields"][number]["offer"];
@@ -27,8 +36,9 @@ const optionalOf = (offer: Offer) => offer.kind === "names" && offer.optional ==
 
 // The span of a value as written, with surrounding quotes and spaces left out of it. In
 // frontmatter a YAML comment after it is left out as well: a `#` after a space, outside quotes.
-// A table cell has no comments, so a name there may hold one.
-function span(line: number, text: string, start: number, target: string, optional: boolean, declared: string, yaml = false): Reference | null {
+// A table cell has no comments, so a name there may hold one. `ticks`: a pair of backticks around
+// the value is not part of the name either, as the parser reads a `by` row's cells.
+function span(line: number, text: string, start: number, target: string, optional: boolean, declared: string, yaml = false, ticks = false): Reference | null {
   let from = start, to = text.length;
   const value = text.slice(start).trimStart();
   if (yaml && !/^["']/.test(value)) {
@@ -38,6 +48,7 @@ function span(line: number, text: string, start: number, target: string, optiona
   while (from < to && /\s/.test(text[from])) from++;
   while (to > from && /\s/.test(text[to - 1])) to--;
   if (to - from >= 2 && /^["']$/.test(text[from]) && text[to - 1] === text[from]) { from++; to--; }
+  if (ticks && to - from >= 2 && text[from] === "`" && text[to - 1] === "`") { from++; to--; }
   return to > from ? { line, from, to, name: text.slice(from, to), target, optional, declared } : null;
 }
 
@@ -126,20 +137,42 @@ export function referencesIn(lines: string[], vocabulary: TypeVocabulary): Refer
     // not read as a table holds no references.
     const header = columns ? tableOf(lines.slice(line, last + 1).join("\n"))?.columns : undefined;
     if (columns && header)
-      for (let row = line + 2; row <= last; row++)
-        cells(lines[row]).forEach((cell, i) => {
+      for (let row = line + 2; row <= last; row++) {
+        const split = cells(lines[row]);
+        // Another cell of this row by its column's name, as the parser reads a `by` row's type
+        // and owner: backticks off, trimmed; "" where the row has no such cell.
+        const cellOf = (name: string | null) => {
+          const cell = name === null ? undefined : split[header.indexOf(name)];
+          return cell ? bare(lines[row].slice(cell.from, cell.to)) : "";
+        };
+        split.forEach((cell, i) => {
           const column = columns.find((c) => c.name === header[i]);
-          const target = column ? targetOf(column.offer) : null;
-          const ref = target ? span(row, lines[row].slice(0, cell.to), cell.from, target, optionalOf(column!.offer), `## ${section} · ${column!.name}`) : null;
+          if (!column) return;
+          const offer = column.offer;
+          const declared = `## ${section} · ${column.name}`;
+          const text = lines[row].slice(0, cell.to);
+          if (offer.kind === "by") {
+            const ref = span(row, text, cell.from, cellOf(offer.by), false, declared, false, true);
+            if (ref) out.push({ ...ref, row: { owner: cellOf(offer.in), schemas: offer.schemas } });
+            return;
+          }
+          // The owner cell of a `by … in` row names an entity of the type that owns the row's
+          // type, as a qualifier names one: listed, marked and renamed, drawing no edge.
+          const target = offer.kind === "owner" ? offer.owners.get(cellOf(offer.by)) ?? null : targetOf(offer);
+          const ref = target ? span(row, text, cell.from, target, optionalOf(offer), declared, false, offer.kind === "owner") : null;
           if (ref) out.push(ref);
         });
+      }
     line = last;
   }
   return out;
 }
 
 // The file of the entity a name names, from the file at `path`, as the checks resolve it: by
-// the declared type, and for an owned type within the owner the file is in. null: it names none.
-export function resolveIn(named: Named[], path: string, model: string, target: string, name: string): string | null {
+// the declared type, and for an owned type within the owner the file is in; or, given a `by`
+// reference's `row`, by the package's `resolveRow`, within the owner its row names and never
+// the file's own place (R4, R9). null: it names none.
+export function resolveIn(named: Named[], path: string, model: string, target: string, name: string, row?: Reference["row"]): string | null {
+  if (row) return resolveRow(named, row.schemas, { type: target, name, owner: row.owner }).entity?.path ?? null;
   return visibleIn(named, path, model).find((n) => n.type === target && n.name === name)?.path ?? null;
 }
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npm run -s typecheck; echo "typecheck $?"
node --test test/references.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `typecheck 0`, then `fail 0` twice. `namelinks.ts`, `refs.ts` and `refactor.ts` still call `resolveIn` with five arguments, which type-checks and resolves a row through the page's place until Tasks 4 and 6 pass the `row` on.

- [ ] **Step 5: Name the three in AGENTS.md among the package readers the plugin calls**

In `AGENTS.md`, in the paragraph that opens with “**A rule the plugin needs that the package does not export**”, replace its last sentence, the one that opens “Where the package exports a reader the plugin calls it:”, with this one, so the row rule is said to be the package's and nothing is added to the paragraph of what the plugin reads for itself:

```markdown
Where the package exports a reader the plugin calls it: `tableOf`, `sectionsOf`, `typeOfPath`, `declarationOf`, `enumTokensOf`, `isNewer`, and for a `ref → by <Column> in <Owner>` row, `ownerTypesOf`, `rowScope` and `resolveRow`.
```

- [ ] **Step 6: Check and commit**

```bash
sh conventions/conventions-format > /dev/null; echo "format $?"
sh conventions/conventions-check > /dev/null; echo "prose $?"
git add src/references.ts AGENTS.md test/references.test.ts
git commit -F - <<'EOF'
A question row names an entity within its row's owner

A question's `## Rests on` row names an entity of the type its `Type` cell names, within the owner its `Owner` cell names where that type is owned, and the parser never consults the page the row is written on. The reader of a file's references now yields the `Entity` cell as a reference whose type is the row's and which carries the row's owner, and the `Owner` cell as a reference to the owning type, as a qualifier names an entity and draws no edge. `resolveIn` hands such a row to the package's `resolveRow`, the rule the parser resolves it by, so a name the row's owner does not hold resolves to nothing even where another owner, or the page's own place, holds it. Backticks around a cell are left out of the name, as the parser leaves them out, and AGENTS.md names the package's three row readers among those the plugin calls.

Verified: npm run typecheck, npm test (all pass), the four new references tests seen failing first, sh conventions/conventions-format and sh conventions/conventions-check exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
```

Expected: `format 0`, `prose 0`, `[A question row names an entity within its row's owner]`.

### Task 4: The pane, Rename and Delete follow the row

**Files:**

- Modify: `src/refs.ts`, `src/refactor.ts`
- Test: `test/refs.test.ts`, `test/refactor.test.ts`

**Interfaces:**

- Consumes: `Reference.row` and `resolveIn(named, path, model, target, name, row?: Reference["row"])` from Task 3.
- Produces: no new names. `referencesFor` lists a question under each entity its rows name and under each owner its rows name, `declared` `## Rests on · Entity` or `## Rests on · Owner`; `referencesTo`, and with it `renamePlan` and `deletePlan`, finds an `Entity` cell and an `Owner` cell by what they resolve to within the row's owner.

- [ ] **Step 1: Write the failing tests**

Append to `test/refs.test.ts`:

```ts
// A question's Rests on (core 0.40.0): a question is listed under each entity it rests on, and
// under the owner its row names, each saying the column it stands in.
const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";

test("a question is listed under the entity it rests on, and under the owner its row names", () => {
  const experience = world.named.find((n) => n.type === "experience" && n.name === "Splitting the billing domain")!.path;
  const under = referencesFor(world, experience).in.find((g) => g.path === WHO)!;
  assert.deepEqual(under.mentions.map((m) => [m.declared, m.name]), [["## Rests on · Entity", "Splitting the billing domain"]]);
  const owner = referencesFor(world, "example/model/profiles/mira-halvorsen/mira-halvorsen.md").in.find((g) => g.path === WHO)!;
  assert.deepEqual(owner.mentions.map((m) => [m.declared, m.name]), [["## Rests on · Owner", "Mira Halvorsen"]]);
  assert.ok(referencesFor(world, "example/model/features/charge-explanation.md").in.some((g) => g.path.endsWith("how-do-i-find-out-why-a-line-is-on-my-invoice.md")));
});

test("what a question names is what its rows name, and a row naming another owner's name names nothing", () => {
  const out = referencesFor(world, WHO).out.map((g) => g.path);
  assert.ok(out.some((p) => p.endsWith("mira-halvorsen/experiences/2022-beacon-systems.md")));
  assert.ok(out.includes("example/model/profiles/mira-halvorsen/mira-halvorsen.md"));
  // The model does not parse with that row, so the names are the last parse's, as in the vault.
  const files = new Map(world.files).set(WHO, world.files.get(WHO)!.replace("| Mira Halvorsen |", "| Tomas Reyes |"));
  const now = referencesFor({ ...world, files }, WHO).out.map((g) => g.path);
  assert.ok(!now.some((p) => p.includes("/experiences/")), "Tomas has no experience of that name");
  assert.ok(now.includes("example/model/profiles/tomas-reyes/tomas-reyes.md"));
});
```

In `test/refactor.test.ts`, change `import { example, EXAMPLE, reference, REFERENCE, whole } from "./helpers.ts";` to `import { edited, example, EXAMPLE, reference, REFERENCE, whole } from "./helpers.ts";` and append:

```ts
// A question's Rests on (core 0.40.0): the Entity cell names what its row's Type and Owner say,
// and the Owner cell names the owner, so a rename of either reaches the row, and a delete of
// either leaves the row naming nothing.
const WHO = "example/model/questions/who-split-billing-out-of-the-monolith.md";
const HOW = "example/model/questions/how-do-i-find-out-why-a-line-is-on-my-invoice.md";

test("renaming an experience a question rests on rewrites the row's Entity cell, and the checks pass after", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "experience", "Splitting the billing domain"), "Splitting billing");
  assert.ok(!("refused" in plan));
  assert.match(plan.texts.get(WHO)!, /^\| experience \| Splitting billing \| Mira Halvorsen \| the period \|$/m);
  assert.deepEqual(checkInstance(carried(whole(files), plan), EXAMPLE).failures, []);
});

test("renaming an owner rewrites every Owner cell that names it, and the rows still resolve", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "profile", "Mira Halvorsen"), "Mira Hale");
  assert.ok(!("refused" in plan));
  assert.match(plan.texts.get(WHO)!, /^\| experience \| Splitting the billing domain \| Mira Hale \| the period \|$/m);
  assert.deepEqual(checkInstance(carried(whole(files), plan), EXAMPLE).failures, []);
});

test("renaming a feature a question rests on rewrites its cell, and leaves a row of another feature alone", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const plan = renamePlan(files, paths, vocabulary, named, model, entity(named, "feature", "Pricing rules"), "Price rules");
  assert.ok(!("refused" in plan));
  const text = plan.texts.get(HOW)!;
  assert.match(text, /^\| feature \| Price rules \| \| what it costs \|$/m);
  assert.match(text, /^\| feature \| Charge explanation \| \| where a line comes from \|$/m);
});

test("a row naming the same name under another owner is not the renamed entity's", () => {
  // Tomas has no experience of this name; a row saying he has is a broken row, not a mention.
  const files = edited(example(), WHO, (t) => t.replace("| Mira Halvorsen |", "| Tomas Reyes |"));
  const { named, vocabulary, model } = setup(example(), EXAMPLE);
  const found = referencesTo(files, vocabulary, named, model, entity(named, "experience", "Splitting the billing domain"));
  assert.ok(!found.some((m) => m.path === WHO));
});

test("renaming any entity of the example, questions among them, leaves the checks clean", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  assert.ok(named.some((n) => n.type === "question"));
  const broken: string[] = [];
  for (const target of named) {
    const plan = renamePlan(files, paths, vocabulary, named, model, target, `${target.name} X`);
    if ("refused" in plan) {
      broken.push(`${target.type} ${target.name}: refused, ${plan.refused}`);
      continue;
    }
    const failures = checkInstance(carried(whole(files), plan), EXAMPLE).failures;
    if (failures.length) broken.push(`${target.type} ${target.name}: ${failures[0]}`);
  }
  assert.deepEqual(broken, []);
});

test("deleting what a question rests on lists the question's row among what would name nothing", () => {
  const { files, paths, named, vocabulary, model } = setup(example(), EXAMPLE);
  const experience = deletePlan(files, paths, vocabulary, named, model, entity(named, "experience", "Splitting the billing domain"));
  assert.ok(!("refused" in experience));
  const row = files.get(WHO)!.split("\n").findIndex((l) => l.startsWith("| experience |"));
  assert.ok(experience.mentions.some((m) => m.path === WHO && m.line === row));
  // An owner goes with what it owns: its row's Entity cell and its Owner cell both name nothing.
  const owner = deletePlan(files, paths, vocabulary, named, model, entity(named, "profile", "Mira Halvorsen"));
  assert.ok(!("refused" in owner));
  assert.equal(owner.mentions.filter((m) => m.path === WHO && m.line === row).length, 2);
});
```

- [ ] **Step 2: Run them to see which fail**

Run: `node --test test/refs.test.ts test/refactor.test.ts 2>&1 | grep -E "^✖ |^ℹ (pass|fail)" | sort -u`

Expected: two failures, `what a question names is what its rows name, and a row naming another owner's name names nothing` and `a row naming the same name under another owner is not the renamed entity's`. The other new tests pass already, and that is worth reading: a question sits in no owner, so the page's own place sees every experience, and the example's names are unique enough that resolving by place finds the right one. The two that fail are the ones where the row's owner and the page's place disagree, which is the case the form exists for.

- [ ] **Step 3: Pass the row's owner on**

Apply this diff:

```diff
diff --git a/src/refactor.ts b/src/refactor.ts
index a0a9c5f..7c9f765 100644
--- a/src/refactor.ts
+++ b/src/refactor.ts
@@ -29,7 +29,7 @@ export function referencesTo(
     if (!v) continue;
     const lines = text.split("\n");
     for (const ref of referencesIn(lines, v))
-      if (ref.target === target.type && ref.name === target.name && resolveIn(named, path, model, ref.target, ref.name) === target.path)
+      if (ref.target === target.type && ref.name === target.name && resolveIn(named, path, model, ref.target, ref.name, ref.row) === target.path)
         out.push({ path, line: ref.line, from: ref.from, to: ref.to });
   }
   return out;
diff --git a/src/refs.ts b/src/refs.ts
index 9cad9d1..02f8b14 100644
--- a/src/refs.ts
+++ b/src/refs.ts
@@ -34,7 +34,7 @@ function mentionsIn(world: World, path: string, text: string): Mention[] {
   if (!vocabulary) return [];
   const out: Mention[] = [];
   for (const ref of referencesIn(text.split("\n"), vocabulary)) {
-    const target = resolveIn(world.named, path, world.model, ref.target, ref.name);
+    const target = resolveIn(world.named, path, world.model, ref.target, ref.name, ref.row);
     if (target) out.push({ path, line: ref.line, name: ref.name, declared: ref.declared, target });
   }
   return out;
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npm run -s typecheck; echo "typecheck $?"
node --test test/refs.test.ts test/refactor.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `typecheck 0`, then `fail 0` twice.

- [ ] **Step 5: Commit**

```bash
git add src/refs.ts src/refactor.ts test/refs.test.ts test/refactor.test.ts
git commit -F - <<'EOF'
The pane, Rename and Delete follow a question's row

The references pane, Rename entity and Delete entity all find a name through the reader of a file's references and `resolveIn`, and both now pass a question row's owner and schemas along to the package's `resolveRow`. So the pane lists a question under each entity it rests on and under the owner its row names, a rename rewrites an `Entity` cell that names the renamed entity and every `Owner` cell that names a renamed owner, and a delete lists the rows it would leave naming nothing. A row that names a name its owner does not hold is none of these, even where the page's own place would have found it.

Verified: npm run typecheck, npm test (all pass), the two tests where the row's owner and the page's place disagree seen failing first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
```

Expected: `[The pane, Rename and Delete follow a question's row]`.

### Task 5: Completion reads the row

**Files:**

- Modify: `src/tables.ts`, `src/context.ts`, `src/candidates.ts`
- Test: `test/context.test.ts`, `test/tables.test.ts`, `test/candidates.test.ts`

**Interfaces:**

- Consumes: the `Offer` kinds (`types` with its `types`, `by` with its `schemas`, `owner` with its `owners`) and `bare` from Task 2; `rowScope(entities, schemas, { type, owner })` from `companygraph-meta-model/instance`, typed in Task 2.
- Produces: in `src/tables.ts`, `rowOf(table: { columns: string[]; rows: string[][] }, index: number): Record<string, string>`; the `cell` kind of `Context` gains `row?: Record<string, string>`, every cell of the row by its column's name as `tableOf` reads it, which `contextAt` and `cellContextOf` now always set; in `src/candidates.ts`, `candidatesFor(context, vocabulary, names, lines, named: Named[] = [])`, `named` being every entity the model holds. The `Type` cell offers the offer's `types`; the `Entity` cell offers the names in `rowScope(named, offer.schemas, { type, owner }).within`, called once per completion request, and nothing where the package answers an error; the `Owner` cell offers the names of `owners.get(type)`, the map built once per vocabulary load. Task 6's `suggest.ts` hands in `this.plugin.named`.

- [ ] **Step 1: Write the failing tests**

The context of a cell now carries its row, so the five assertions that compare a whole cell context gain it. Apply to the two test files:

```diff
diff --git a/test/context.test.ts b/test/context.test.ts
index aa60966..e28cb09 100644
--- a/test/context.test.ts
+++ b/test/context.test.ts
@@ -36,7 +36,7 @@ test("at the start of a frontmatter line: a key", () => {
 });
 
 test("in a table row: the cell's column by the header's name, under its section", () => {
-  assert.deepEqual(at(13), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9 });
+  assert.deepEqual(at(13), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9, row: { Skill: "Java", Level: "Exp", Evidence: "" } });
 });
 
 test("the header and separator rows are not cells", () => {
@@ -102,7 +102,7 @@ test("a cell with only a space before the next pipe is still offered", () => {
     "| --- | --- | --- |",
     "| Java | Exp | built it |",
   ];
-  assert.deepEqual(contextAt(lines, 4, 12), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9 });
+  assert.deepEqual(contextAt(lines, 4, 12), { kind: "cell", section: "Skills", column: "Level", typed: "Exp", start: 9, row: { Skill: "Java", Level: "Exp", Evidence: "built it" } });
 });
 
 test("trailing whitespace only after the cursor still yields the context", () => {
diff --git a/test/tables.test.ts b/test/tables.test.ts
index 440c687..3895b62 100644
--- a/test/tables.test.ts
+++ b/test/tables.test.ts
@@ -26,9 +26,9 @@ test("the section a line sits under is the nearest ## heading above it, read one
 
 test("a body cell of a table in Live Preview is a cell context named by the header the package reads", () => {
   assert.deepEqual(cellContextOf({ table: TABLE, row: 2, col: 1, section: "Skills", lines: 1, line: "Ex", ch: 2 }),
-    { kind: "cell", section: "Skills", column: "Level", typed: "Ex", start: 0 });
+    { kind: "cell", section: "Skills", column: "Level", typed: "Ex", start: 0, row: { Skill: "Go", Level: "Ex", Evidence: "" } });
   assert.deepEqual(cellContextOf({ table: TABLE, row: 1, col: 0, section: "Skills", lines: 1, line: "  Ja", ch: 4 }),
-    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 2 });
+    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 2, row: { Skill: "Java", Level: "Expert", Evidence: "built it" } });
 });
 
 // The one test that holds the two ways into a cell together: Source mode reads the row's pipes,
@@ -37,7 +37,7 @@ test("Source mode and Live Preview reach the same context for the same cell", ()
   const source = contextAt(NOTE, 15, "| Go | Ex".length);
   const live = cellContextOf({ table: TABLE, row: 2, col: 1, section: sectionAbove(at(NOTE), 12), lines: 1, line: "Ex", ch: 2 });
   assert.ok(source && live && source.kind === "cell" && live.kind === "cell");
-  assert.deepEqual([live.section, live.column, live.typed], [source.section, source.column, source.typed]);
+  assert.deepEqual([live.section, live.column, live.typed, live.row], [source.section, source.column, source.typed, source.row]);
 });
 
 test("a table the package does not read as one gives no context in either mode", () => {
@@ -54,7 +54,7 @@ test("the header row, no section, a column past the header, text after the curso
   assert.equal(cellContextOf({ ...base, row: 1, col: 0, line: "Java", ch: 2 }), null);
   assert.equal(cellContextOf({ ...base, lines: 2, row: 1, col: 0, line: "Ja", ch: 2 }), null);
   assert.deepEqual(cellContextOf({ ...base, row: 1, col: 0, line: "Ja  ", ch: 2 }),
-    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 0 });
+    { kind: "cell", section: "Skills", column: "Skill", typed: "Ja", start: 0, row: { Skill: "Java", Level: "Expert", Evidence: "built it" } });
 });
 
 test("a failing line is a row of the table widget drawn from its first line", () => {
```

In `test/candidates.test.ts`, add `import { namedOf } from "../src/scope.ts";` after the import from `../src/candidates.ts`, and append:

```ts
// A question's Rests on (core 0.40.0): what each of its columns offers is read from the row, and
// from every entity the model holds, which is what suggest.ts hands in.
const every = namedOf(buildModel(files, EXAMPLE).graph!);
const question = vocabulary.get("question")!;
const rests = (column: string, row: Record<string, string>, typed = "") =>
  labels(candidatesFor({ kind: "cell", section: "Rests on", column, typed, start: 0, row }, question, names, [], every));

test("the Type column offers the types the vault's core declares", () => {
  const types = rests("Type", { Type: "", Entity: "", Owner: "", For: "" });
  assert.deepEqual(types, [...vocabulary.keys()].sort((a, b) => a.localeCompare(b)));
  assert.ok(types.includes("experience") && types.includes("question"));
  assert.deepEqual(rests("Type", { Type: "exp" }, "exp"), ["experience", "experience-kind"]);
});

test("the Entity column offers the names of the row's type, within the row's owner where the type is owned", () => {
  assert.deepEqual(rests("Entity", { Type: "experience", Owner: "Mira Halvorsen" }), ["Rebuilding the order pipeline", "Splitting the billing domain"]);
  assert.equal(rests("Entity", { Type: "`experience`", Owner: "`Tomas Reyes`" }).length, 3);
  assert.deepEqual(rests("Entity", { Type: "experience", Owner: "" }), [], "an owned type waits for its owner");
  assert.deepEqual(rests("Entity", { Type: "feature", Owner: "" }), names.get("feature"));
  assert.deepEqual(rests("Entity", { Type: "", Owner: "" }), [], "no type, nothing to offer");
});

test("the Owner column offers the names of the type that owns the row's type, and nothing for an unowned one", () => {
  assert.deepEqual(rests("Owner", { Type: "experience" }), names.get("profile"));
  assert.deepEqual(rests("Owner", { Type: "feature" }), []);
});

test("a Rests on cell with no row read, or no entities handed in, offers no names rather than guess", () => {
  assert.deepEqual(labels(candidatesFor({ kind: "cell", section: "Rests on", column: "Entity", typed: "", start: 0 }, question, names, [], every)), []);
  assert.deepEqual(labels(candidatesFor({ kind: "cell", section: "Rests on", column: "Entity", typed: "", start: 0, row: { Type: "experience", Owner: "Mira Halvorsen" } }, question, names, [])), []);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/context.test.ts test/tables.test.ts test/candidates.test.ts 2>&1 | grep -E "^✖ |^ℹ (pass|fail)" | sort -u`

Expected: `fail 2` in each of the context and tables files, each an assertion now expecting `row`, and three failures among the candidates, the `Type`, `Entity` and `Owner` column tests. The last candidates test passes already, since nothing is offered today.

- [ ] **Step 3: Read the row, and offer from it**

Apply this diff:

```diff
diff --git a/src/candidates.ts b/src/candidates.ts
index 86fb282..07fd2eb 100644
--- a/src/candidates.ts
+++ b/src/candidates.ts
@@ -2,10 +2,12 @@
 // which names exist, the file says what is already there. Nothing is offered that would not
 // resolve, and nothing is wrapped: a name is inserted plain (R3).
 import { sectionsOf } from "companygraph-meta-model/checks";
-import { IMAGE_FILE } from "companygraph-meta-model/instance";
+import { IMAGE_FILE, rowScope } from "companygraph-meta-model/instance";
 import type { Context } from "./context.ts";
 import { frontmatterEnd } from "./context.ts";
+import { bare } from "./vocabulary.ts";
 import type { Field, Offer, TypeVocabulary } from "./vocabulary.ts";
+import type { Named } from "./scope.ts";
 
 export interface Candidate { label: string; insert: string }
 
@@ -24,9 +26,23 @@ export function cursorAfter(start: Position, insert: string): Position {
 const requiredFirst = <T extends { required: boolean }>(items: T[]) =>
   [...items.filter((i) => i.required), ...items.filter((i) => !i.required)];
 
-function offered(offer: Offer, names: Map<string, string[]>): string[] {
+const sortedNames = (named: Named[]) => [...new Set(named.map((n) => n.name))].sort((a, b) => a.localeCompare(b));
+
+// `row` is the cell's row by column, and `named` every entity the model holds: a `by` row says
+// itself where its name is (R4, R9), so its offers are drawn from the whole model, whatever the
+// page's own place. The Entity column asks the package's `rowScope` once per completion request.
+function offered(offer: Offer, names: Map<string, string[]>, row: Record<string, string> = {}, named: Named[] = []): string[] {
   if (offer.kind === "names") return names.get(offer.target) ?? [];
   if (offer.kind === "values") return offer.values;
+  if (offer.kind === "types") return offer.types;
+  if (offer.kind === "by") {
+    const scope = rowScope(named, offer.schemas, { type: bare(row[offer.by]), owner: offer.in ? bare(row[offer.in]) : "" });
+    return sortedNames(scope.within ?? []);
+  }
+  if (offer.kind === "owner") {
+    const owner = offer.owners.get(bare(row[offer.by]));
+    return owner ? sortedNames(named.filter((n) => n.type === owner)) : [];
+  }
   return [];
 }
 
@@ -60,8 +76,9 @@ export function candidatesFor(
   vocabulary: TypeVocabulary,
   names: Map<string, string[]>,
   lines: string[],
+  named: Named[] = [],
 ): Candidate[] {
-  const candidates = offers(context, vocabulary, names, lines);
+  const candidates = offers(context, vocabulary, names, lines, named);
   // What is typed is already one of the things on offer: there is nothing left to complete, and
   // a popup still open over it captures the Enter that belongs to the editor. One candidate is
   // not the test — `Java` typed in full still matches `JavaScript` — what is typed is.
@@ -84,6 +101,7 @@ function offers(
   vocabulary: TypeVocabulary,
   names: Map<string, string[]>,
   lines: string[],
+  named: Named[],
 ): Candidate[] {
   if (context.kind === "key") {
     const absent = absentFields(vocabulary, lines);
@@ -106,7 +124,7 @@ function offers(
       .find((s) => s.heading === context.section)
       ?.columns?.find((c) => c.name === context.column);
     if (!column) return [];
-    return matching(offered(column.offer, names), context.typed).map((v) => ({ label: v, insert: v }));
+    return matching(offered(column.offer, names, context.row, named), context.typed).map((v) => ({ label: v, insert: v }));
   }
   if (context.kind === "grouped") {
     const section = vocabulary.sections.find((s) => s.heading === context.section);
diff --git a/src/context.ts b/src/context.ts
index f9a9b1d..f2133ab 100644
--- a/src/context.ts
+++ b/src/context.ts
@@ -2,7 +2,7 @@
 // context or null out. `start` is the column the typed text begins at, which is what a
 // candidate replaces.
 import { tableOf } from "companygraph-meta-model/checks";
-import { sectionAbove } from "./tables.ts";
+import { rowOf, sectionAbove } from "./tables.ts";
 
 export type Context =
   | { kind: "key"; typed: string; start: number }
@@ -11,7 +11,9 @@ export type Context =
   // `glued` says no space stands between the colon and where the value begins, so whoever
   // inserts there brings one: `source:Local` is one bare word to YAML and no field at all.
   | { kind: "value"; field: string; typed: string; start: number; item: boolean; glued: boolean }
-  | { kind: "cell"; section: string; column: string; typed: string; start: number }
+  // `row`: every cell of the row by its column's name, as the package's table reader reads it,
+  // for a `by` column, whose type and owner are the row's; absent where no row was read.
+  | { kind: "cell"; section: string; column: string; typed: string; start: number; row?: Record<string, string> }
   | { kind: "heading"; typed: string; start: number }
   // A `###` heading under a `##` section, which names an entity where the schema declares the
   // section grouped; whether it does is the vocabulary's to say.
@@ -96,7 +98,7 @@ export function contextAt(lines: string[], line: number, ch: number): Context |
     const rest = next === -1 ? after : after.slice(0, next);
     if (rest.trim() !== "") return null;
     const typed = before.slice(before.lastIndexOf("|") + 1).trimStart();
-    return { kind: "cell", section, column, typed, start: ch - typed.length };
+    return { kind: "cell", section, column, typed, start: ch - typed.length, row: rowOf(table, line - first - 2) };
   }
   return null;
 }
diff --git a/src/tables.ts b/src/tables.ts
index 14cd19f..3287c87 100644
--- a/src/tables.ts
+++ b/src/tables.ts
@@ -15,6 +15,13 @@ export function sectionAbove(getLine: (n: number) => string | undefined, line: n
   return null;
 }
 
+// One body row of a table the package read, by its columns' names, each cell as the package's
+// reader gives it, trimmed; "" for a cell the row lacks. What a `by` column reads its type and
+// owner from, in either mode.
+export function rowOf(table: { columns: string[]; rows: string[][] }, index: number): Record<string, string> {
+  return Object.fromEntries(table.columns.map((c, i) => [c, table.rows[index]?.[i] ?? ""]));
+}
+
 export interface CellFacts {
   table: string;          // the table's own lines in the note, as text
   row: number;            // 0 is the header row; the separator row is not a row
@@ -31,15 +38,16 @@ export interface CellFacts {
 // name a column alike and a table the package does not read as one gives no context in either.
 export function cellContextOf(facts: CellFacts): Context | null {
   if (facts.row < 1 || !facts.section) return null;
-  const column = tableOf(facts.table)?.columns[facts.col];
-  if (!column) return null;
+  const table = tableOf(facts.table);
+  const column = table?.columns[facts.col];
+  if (!table || !column) return null;
   // A cell holding `<br>` is several lines in its editor and one in the note; Source mode sees
   // the whole of it on one line, and a name inserted into part of it would not be what was meant.
   if (facts.lines !== 1) return null;
   // As in a line of text: anything but blank after the cursor means it sits inside text.
   if (facts.line.slice(facts.ch).trim() !== "") return null;
   const typed = facts.line.slice(0, facts.ch).trimStart();
-  return { kind: "cell", section: facts.section, column, typed, start: facts.ch - typed.length };
+  return { kind: "cell", section: facts.section, column, typed, start: facts.ch - typed.length, row: rowOf(table, facts.row - 1) };
 }
 
 export type TableRow = { kind: "header" } | { kind: "body"; index: number };
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npm run -s typecheck; echo "typecheck $?"
node --test test/context.test.ts test/tables.test.ts test/candidates.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `typecheck 0`, then `fail 0` twice.

- [ ] **Step 5: Commit**

```bash
git add src/tables.ts src/context.ts src/candidates.ts test/context.test.ts test/tables.test.ts test/candidates.test.ts
git commit -F - <<'EOF'
Completion in a question's row reads the row

A cell's context now carries every cell of its row, read by the package's table reader in Source mode and in Live Preview alike, and completion takes every entity the model holds. In a question's `## Rests on` the `Type` cell offers the types the vault's core declares, the `Owner` cell the names of the type that owns the row's type, from the package's `ownerTypesOf` read once per vocabulary, and the `Entity` cell what the package's `rowScope` narrows the row to, asked once per completion request. An owned type offers nothing until its owner is named, rather than every owner's names at once, and a cell that names no type offers nothing.

Verified: npm run typecheck, npm test (all pass), the three column tests and the context assertions seen failing first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
```

Expected: `[Completion in a question's row reads the row]`.

### Task 6: In Obsidian, a question row links, marks and completes

**Files:**

- Create: `e2e/question.e2e.ts`
- Modify: `src/namelinks.ts`, `src/suggest.ts`

**Interfaces:**

- Consumes: `Reference.row` and `resolveIn(named, path, model, target, name, row?: Reference["row"])` from Task 3; `candidatesFor(context, vocabulary, names, lines, named)` from Task 5; `start`, `Session`, `available` from `e2e/obsidian.ts`; `PROFILE`, `openNote`, `tablesOf` from `e2e/notes.ts`; `clearNotices`, `command`, `intoField`, `modalText`, `noModal`, `onDisk`, `pressButton`, `waitForChecks`, `waitForModal`, `waitForNotice` from `e2e/ui.ts`.
- Produces: in `src/suggest.ts` both calls of `candidatesFor` hand in `this.plugin.named`; in `src/namelinks.ts` the resolver's `resolve(target: string, name: string, row?: Reference["row"])`, which resolves a row among every entity through `resolveRow` and anything else among what the page sees.

- [ ] **Step 1: Write the e2e test**

Create `e2e/question.e2e.ts`:

```ts
// A question's Rests on as a person writes one (core 0.40.0, meta-model v0.45.0): a row's cells
// complete from the row, the references pane lists the question under what it rests on, a name
// in a row opens its entity and one that names nothing is marked, and renaming the owner a row
// names carries its Owner cell. The fixture vendors a core older than the type, so the vault is
// first given the question schema of the release this build bundles, and one question.
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { available, start } from "./obsidian.ts";
import type { Session } from "./obsidian.ts";
import { PROFILE, openNote, tablesOf } from "./notes.ts";
import { clearNotices, command, intoField, modalText, noModal, onDisk, pressButton, waitForChecks, waitForModal, waitForNotice } from "./ui.ts";

const skip = available() ? false : "Obsidian is not installed here; set OBSIDIAN_BIN to run this suite";

const SCHEMA = fs.readFileSync(path.join(import.meta.dirname, "..", "test", "fixtures", "meta-model", "core", "question-schema.md"), "utf8");
const QUESTION = "model/questions/who-spoke-at-eclipse-mdd-day.md";
const EXPERIENCE = "model/profiles/robert-blust/experiences/2010-eclipse-mdd-day.md";
const TEXT = [
  "---", "source: Local", "---", "",
  "# Who spoke at Eclipse MDD Day?", "",
  "> The experience says who spoke, and the skill what it took.", "",
  "## Rests on", "",
  "| Type | Entity | Owner | For |",
  "| --- | --- | --- | --- |",
  "| experience | Eclipse MDD Day 2010 | Robert Blust | who spoke |",
  "| skill | Public speaking | | what it took |",
  "",
].join("\n");
const ROW = "| experience | Eclipse MDD Day 2010 | Robert Blust | who spoke |";

const offered = () => {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".suggestion-container .suggestion-item")).map((el) => el.innerText.trim());
  return items.length ? items : null;
};

// The question as it was written, in the file and in what the plugin read, after a test edited it.
const putBack = async (ui: Session["ui"]) => {
  await ui.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); });
  await ui.waitFor("the question to be as it was written", async (at: string, as: string) => {
    const file = app.vault.getAbstractFileByPath(at);
    if ((await app.vault.read(file)) !== as) {
      await app.vault.modify(file, as);
      return false;
    }
    return app.plugins.plugins.companygraph.files.get(at) === as;
  }, [QUESTION, TEXT]);
};

describe("a question's Rests on", { skip }, () => {
  let session: Session;
  before(async () => {
    session = await start();
    const { ui } = session;
    await ui.evaluate(async (schema: string, at: string, text: string) => {
      await app.vault.adapter.write("meta/core/question-schema.md", schema);
      await app.vault.createFolder("model/questions");
      await app.vault.create(at, text);
    }, [SCHEMA, QUESTION, TEXT]);
    await command(ui, "check-now");
    await waitForChecks(ui, "the checks to pass with a question in the vault", "none");
    await ui.waitFor("the plugin to know the question", (at: string) =>
      (app.plugins.plugins.companygraph.named as { path: string }[]).some((n) => n.path === at), [QUESTION]);
  });
  afterEach(async (t) => { if (!(t as { passed?: boolean }).passed) await session.record((t as { name: string }).name); });
  after(async () => { await session?.stop(); });

  test("the references pane lists the question under the experience it rests on, and a click opens its row", async () => {
    const { ui } = session;
    await openNote(ui, EXPERIENCE);
    await ui.evaluate(() => app.commands.executeCommandById("companygraph:open-references"));
    const said = await ui.waitFor("the pane to list the question", () => {
      const text = (app.workspace.getLeavesOfType("companygraph-references")[0]?.view.contentEl as HTMLElement | undefined)?.innerText ?? "";
      return text.includes("who-spoke-at-eclipse-mdd-day") ? text : null;
    });
    assert.match(said, /Rests on · Entity/);
    await ui.click(() => Array.from(document.querySelectorAll<HTMLElement>(".companygraph-file"))
      .find((f) => f.querySelector(".companygraph-file-name")?.textContent?.startsWith("who-spoke-at-eclipse-mdd-day"))
      ?.querySelector("li.companygraph-open"));
    await ui.waitFor("the question to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [QUESTION]);
  });

  test("a name in a row carries its entity's path, Cmd+click opens it, and a row naming another owner is marked unresolved", async () => {
    const { ui } = session;
    await openNote(ui, QUESTION);
    const owner = await ui.waitFor("the Owner cell to carry the profile's path", (at: string) =>
      document.querySelector(`.cm-table-widget td.companygraph-ref[data-companygraph-path="${at}"]`) ? at : null, [PROFILE]);
    assert.equal(owner, PROFILE);
    await ui.click((at: string) => document.querySelector(`.cm-table-widget td.companygraph-ref[data-companygraph-path="${at}"] .table-cell-wrapper`), [EXPERIENCE], { mod: true });
    await ui.waitFor("the experience to be in front", (at: string) => app.workspace.getActiveFile()?.path === at, [EXPERIENCE]);

    await openNote(ui, QUESTION);
    await ui.evaluate(async (at: string, row: string) => {
      const file = app.vault.getAbstractFileByPath(at);
      await app.vault.modify(file, ((await app.vault.read(file)) as string).replace(row, row.replace("Robert Blust", "AI Agent")));
    }, [QUESTION, ROW]);
    const marked = await ui.waitFor("the Entity cell to be marked as naming nothing", () => {
      const cell = Array.from(document.querySelectorAll<HTMLElement>(".cm-table-widget td")).find((td) => td.innerText.trim() === "Eclipse MDD Day 2010");
      return cell?.classList.contains("is-unresolved") ? cell.innerText.trim() : null;
    });
    assert.equal(marked, "Eclipse MDD Day 2010");
    await putBack(ui);
  });

  test("the Type cell offers the core's types, and the Entity cell the names of the row's owner", async () => {
    const { ui } = session;
    const table = tablesOf(TEXT)[0];
    const lines = TEXT.split("\n");
    await openNote(ui, QUESTION);
    await ui.evaluate(async (at: string, text: string) => app.vault.modify(app.vault.getAbstractFileByPath(at), text),
      [QUESTION, [...lines.slice(0, table.last + 1), "|  |  |  |  |", "| experience |  | Robert Blust |  |", ...lines.slice(table.last + 1)].join("\n")]);
    const blank = table.last - table.first;

    await ui.click((at: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[at]?.children[0], [blank]);
    const types = await ui.waitFor("the types of the core to be offered", offered);
    const declared = await ui.evaluate(() => [...(app.plugins.plugins.companygraph.vocabulary as Map<string, unknown>).keys()].sort());
    assert.deepEqual([...types].sort(), declared);
    assert.ok(types.includes("experience") && types.includes("question"));
    await ui.press("Escape");
    await ui.waitFor("the list to be closed", () => !document.querySelector(".suggestion-container"));

    await ui.click((at: number) => document.querySelector(".cm-table-widget table")?.querySelectorAll("tr")[at]?.children[1], [blank + 1]);
    const names = await ui.waitFor("the names of the owner's experiences to be offered", offered);
    const own = await ui.evaluate((folder: string) => (app.plugins.plugins.companygraph.named as { type: string; name: string; path: string }[])
      .filter((n) => n.type === "experience" && n.path.startsWith(folder)).map((n) => n.name).sort(), ["model/profiles/robert-blust/"]);
    assert.deepEqual([...names].sort(), own);
    await ui.press("ArrowDown");
    await ui.press("Enter");
    const written = await ui.waitFor("the chosen experience to be written into the row", (at: number, choices: string[]) => {
      const line = (app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue() as string).split("\n")[at];
      return choices.find((name) => line.includes(`| ${name} |`)) ?? null;
    }, [table.last + 2, own]);
    assert.ok(own.includes(written));
    await putBack(ui);
  });

  // Last: it renames the fixture's profile, and every test above reads it by its name.
  test("renaming the owner a row names rewrites the row's Owner cell, and the checks stay clean", async () => {
    const { ui } = session;
    await openNote(ui, PROFILE);
    await clearNotices(ui);
    await command(ui, "rename-entity");
    await waitForModal(ui, 'Rename profile "Robert Blust"');
    await intoField(ui, "New name");
    await ui.press("a", { mod: true });
    await ui.type("Rob Blust");
    await pressButton(ui, "Review");
    await ui.waitFor("the review to list the question", (at: string) => (document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "").includes(at), [QUESTION]);
    assert.match(await modalText(ui), /who-spoke-at-eclipse-mdd-day/);
    await pressButton(ui, "Rename");
    await waitForNotice(ui, "^Renamed to ");
    await noModal(ui);
    await ui.waitFor("the question's row to name the owner by its new name", async (at: string, row: string) =>
      ((await app.vault.adapter.read(at)) as string).includes(row), [QUESTION, ROW.replace("Robert Blust", "Rob Blust")]);
    assert.ok(!(await onDisk(ui, QUESTION))!.includes("| Robert Blust |"));
    await waitForChecks(ui, "the checks to be clean after the rename", "none");
  });
});
```

It adds a question to its own vault copy that rests on the fixture's experience “Eclipse MDD Day 2010”, owned by “Robert Blust”, and on the skill “Public speaking”; the checks were seen clean on that vault in the throwaway copy, the reference instance with this schema and this question passing `checkInstance` with no failure. The rename test goes last because it renames the fixture's profile, which the others read by name.

- [ ] **Step 2: Run it on the build before the source change**

Tell the owner the suite is about to open a window, then:

```bash
npm run -s typecheck; echo "typecheck $?"
node scripts/fixtures.mjs > /dev/null && node esbuild.config.mjs > /dev/null 2>&1; echo "build $?"
node --test --test-concurrency=1 e2e/question.e2e.ts 2>&1 | grep -E "^✖ |^ℹ (pass|fail|skipped)" | sort -u
```

Expected: `typecheck 0`, `build 0`, `skipped 0`, and two failures. The pane test and the rename test pass, since Tasks 3 and 4 made them. `a name in a row carries its entity's path, Cmd+click opens it, and a row naming another owner is marked unresolved` fails waiting for “the Entity cell to be marked as naming nothing”, because `namelinks.ts` still resolves the row through the page's place, where the fixture's experience is found whatever owner the row names. `the Type cell offers the core's types, and the Entity cell the names of the row's owner` fails waiting for “the types of the core to be offered”, because `suggest.ts` hands completion no entities. If anything else fails, read the screenshot and errors under `e2e/failures/` before changing any source.

- [ ] **Step 3: Pass the row to the marks, and the entities to completion**

Apply this diff:

```diff
diff --git a/src/namelinks.ts b/src/namelinks.ts
index 7f5f68b..617a1e6 100644
--- a/src/namelinks.ts
+++ b/src/namelinks.ts
@@ -11,6 +11,7 @@ import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
 import { typeOfPath } from "companygraph-meta-model/checks";
 import type CompanyGraphPlugin from "./main.ts";
 import { cellAt, referencesIn, resolveIn } from "./references.ts";
+import type { Reference } from "./references.ts";
 import { visibleIn } from "./scope.ts";
 
 // Sent after a rebuild, since what a name resolves to can change without the text changing.
@@ -28,7 +29,10 @@ function resolverFor(plugin: CompanyGraphPlugin, path: string | undefined) {
   if (!vocabulary) return null;
   // What the file may name is worked out once per pass, not once per name.
   const visible = visibleIn(plugin.named, path, layout.model);
-  return { vocabulary, resolve: (target: string, name: string) => resolveIn(visible, path, layout.model, target, name) };
+  // A `by` reference names its owner in its own row, so it is resolved among every entity.
+  const resolve = (target: string, name: string, row?: Reference["row"]) =>
+    resolveIn(row ? plugin.named : visible, path, layout.model, target, name, row);
+  return { vocabulary, resolve };
 }
 
 export function nameLinks(plugin: CompanyGraphPlugin) {
@@ -52,7 +56,7 @@ export function nameLinks(plugin: CompanyGraphPlugin) {
           .map((r) => ({ ...r, at: doc.line(r.line + 1).from }))
           .sort((a, b) => a.at + a.from - (b.at + b.from));
         for (const ref of refs) {
-          const path = resolver.resolve(ref.target, ref.name);
+          const path = resolver.resolve(ref.target, ref.name, ref.row);
           // An optional reference that names nothing is a fact, and drawn as the text it is.
           if (!path && ref.optional) continue;
           builder.add(
@@ -81,10 +85,10 @@ export function markNames(plugin: CompanyGraphPlugin, view: MarkdownView, cm: Ed
   }
   const resolver = resolverFor(plugin, view.file?.path);
   if (!resolver) return;
-  const mark = (el: Element | null, target: string, name: string | null | undefined, optional = false) => {
+  const mark = (el: Element | null, target: string, name: string | null | undefined, optional = false, row?: Reference["row"]) => {
     const text = (name ?? "").trim();
     if (!el || !text) return;
-    const path = resolver.resolve(target, text);
+    const path = resolver.resolve(target, text, row);
     // An optional reference that names nothing is a fact, and drawn as the text it is.
     if (!path && optional) return;
     el.setAttribute(MARK, "");
@@ -131,7 +135,7 @@ export function markNames(plugin: CompanyGraphPlugin, view: MarkdownView, cm: Ed
       const line = first + 2 + body;
       for (const ref of byLine.get(line) ?? []) {
         const cell = cellAt(lines[line], ref.from);
-        if (cell !== null) mark(tr.children[cell] ?? null, ref.target, ref.name, ref.optional);
+        if (cell !== null) mark(tr.children[cell] ?? null, ref.target, ref.name, ref.optional, ref.row);
       }
     });
   }
diff --git a/src/suggest.ts b/src/suggest.ts
index 834efe5..4a5bb1d 100644
--- a/src/suggest.ts
+++ b/src/suggest.ts
@@ -99,7 +99,7 @@ export class Suggest extends EditorSuggest<Candidate> {
       const context = cellContextOf({ ...cell, lines: editor.lineCount(), line: editor.getLine(cursor.line), ch: cursor.ch });
       if (!context) return null;
       if (entersThrough(context) && !this.enterFirst && !asked) return null;
-      const candidates = candidatesFor(context, vocabulary, namesIn(this.plugin.named, file.path, layout.model), []);
+      const candidates = candidatesFor(context, vocabulary, namesIn(this.plugin.named, file.path, layout.model), [], this.plugin.named);
       return candidates.length ? { context, candidates } : null;
     }
 
@@ -116,7 +116,7 @@ export class Suggest extends EditorSuggest<Candidate> {
     // An empty entry shows its names only where its Enter can be let through.
     if (entersThrough(context) && !this.enterFirst && !asked) return null;
     // The names this file may use: an owned type's are its owner's own, as core 0.30.1 holds.
-    const candidates = candidatesFor(context, vocabulary, namesIn(this.plugin.named, file.path, layout.model), lines);
+    const candidates = candidatesFor(context, vocabulary, namesIn(this.plugin.named, file.path, layout.model), lines, this.plugin.named);
     return candidates.length ? { context, candidates } : null;
   }
 
```

- [ ] **Step 4: Run the file to see it pass, three times**

```bash
npm run -s typecheck; echo "typecheck $?"
node esbuild.config.mjs > /dev/null 2>&1; echo "build $?"
for run in 1 2 3; do node --test --test-concurrency=1 e2e/question.e2e.ts 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo; done
```

Expected: `typecheck 0`, `build 0`, and `fail 0` on each of the three runs.

- [ ] **Step 5: Run everything**

```bash
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
npm run e2e 2>&1 | grep -E "^ℹ (pass|fail|skipped)"
```

Expected: `fail 0`; then `fail 0` and `skipped 0`, all pass. `e2e/commands.e2e.ts` is among them and needs nothing, since no command was added.

- [ ] **Step 6: Commit**

```bash
git add e2e/question.e2e.ts src/namelinks.ts src/suggest.ts
git commit -F - <<'EOF'
In Obsidian a question row links, marks and completes

The marks in Source mode and in Live Preview's tables now resolve a question row's name by the package's `resolveRow`, within the owner its row names, among every entity the model holds, so a name the row's owner does not hold is drawn as naming nothing, and one it holds opens on Cmd+click. Completion hands in every entity the model holds, so a question's `Type`, `Entity` and `Owner` cells complete from the row.

`e2e/question.e2e.ts` gives its vault copy the bundled question schema and one question, since the fixture's core is older than the type, and works the four paths a person takes: the references pane listing the question under the experience it rests on, Cmd+click on a name in the row and the mark on one its owner does not hold, completion in the `Type` and `Entity` cells, and a rename of the owner rewriting the row's `Owner` cell. The mark and completion tests failed on the build before this change.

Verified: npm run typecheck, npm test (all pass), npm run e2e (all pass), e2e/question.e2e.ts three runs in a row and its two tests seen failing before the source change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
```

Expected: `[In Obsidian a question row links, marks and completes]`.

### Task 7: The manual, 0.10.0 and the pull request

**Files:**

- Modify: `README.md`, `package.json`, `manifest.json`, `package-lock.json`

**Interfaces:**

- Consumes: everything above.
- Produces: the branch pushed and a pull request, open.

- [ ] **Step 1: Say what a question row does, in the manual**

In `README.md`, directly after the paragraph that opens `A name a schema declares as a reference is styled as a link`, add this paragraph, with an empty line before and after it:

```markdown
A question, a type of core since 0.40.0, names the entities its answer rests on in a `## Rests on` table whose `Entity` column takes its type from the row: the `Type` cell names the type, and where that type is owned, the `Owner` cell names the owner. The plugin reads the row as the checks do, and never by the page the row is written on. The `Type` cell offers the types the vault's core declares, the `Owner` cell the names of the type that owns the row's type, and the `Entity` cell the names of the row's type within the row's owner, so an experience is offered once its profile is named. The name in the `Entity` cell is styled as a link and opens on Cmd+click, and one the row's owner does not hold is marked as naming nothing. The references pane lists the question under each entity it rests on and under the owner its row names. Rename entity rewrites an `Entity` cell that names the renamed entity and every `Owner` cell that names a renamed owner, and Delete entity lists the rows it would leave naming nothing.
```

- [ ] **Step 2: Move the version to 0.10.0**

A feature a vault sees and nothing a vault must do, so a minor. Read the version first; it is `0.9.1` on `main`, and if it is anything else, take the next minor after it and say so. Change `"version": "0.9.1"` to `"version": "0.10.0"` in `package.json` and in `manifest.json`, then let the lockfile follow and see what moved:

```bash
npm install --package-lock-only > /dev/null 2>&1; echo "lock $?"
node -e 'const l=require("./package-lock.json");console.log(l.version,l.packages[""].version,require("./manifest.json").version,require("./package.json").version)'
git diff --stat
```

Expected: `lock 0`; `0.10.0 0.10.0 0.10.0 0.10.0`; and only `README.md`, `manifest.json`, `package-lock.json` and `package.json` moved. `test/pin.test.ts` already holds the manifest and package.json to one version.

- [ ] **Step 3: Check, commit and push**

```bash
npm run -s typecheck; echo "typecheck $?"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
npm run -s build > /dev/null 2>&1; echo "build $?"
sh conventions/conventions-format > /dev/null; echo "format $?"
sh conventions/conventions-check > /dev/null; echo "prose $?"
git add README.md package.json manifest.json package-lock.json
git commit -F - <<'EOF'
The plugin reads 0.10.0, and the manual says what a question is

The README says what a question row is and what the plugin does with it: what each of its cells offers, how its name is linked and marked, where the references pane lists it, and what Rename entity and Delete entity do to it. A vault sees completion, links and marks where it saw none and nothing it holds changes, so this is a minor; package.json and manifest.json move together, and the lockfile follows.

Verified: npm run typecheck, npm test (all pass), npm run build, sh conventions/conventions-format and sh conventions/conventions-check exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='[%s]'
git -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push -u https://github.com/companygraph/obsidian-plugin.git a-question-row-is-written-in-the-vault
```

Expected: `typecheck 0`, `fail 0`, `build 0`, `format 0`, `prose 0`, `[The plugin reads 0.10.0, and the manual says what a question is]`, and the push accepted.

- [ ] **Step 4: Open the pull request and stop**

Read the last two merged pull requests' bodies first and match their register, prose paragraphs with no headings or bullets:

```bash
gh pr view 70 --json body --jq .body
gh pr view 69 --json body --jq .body
```

Then open it:

```bash
gh pr create --repo companygraph/obsidian-plugin --base main --head a-question-row-is-written-in-the-vault --title "A question row is written in the vault" --body-file - <<'EOF'
meta-model v0.45.0 added core's `question` and a reference form whose type is read from its row, `ref → by <Column> in <Owner>`: a question's `## Rests on` names an entity of the type its `Type` cell names, within the owner its `Owner` cell names where that type is owned, and never by the page the row is written on. The plugin is where a question is written, so this supports the form rather than only re-pinning, as the design's section on the plugin asks (companygraph/meta-model#147), and v0.46.0 exports the rule that resolves such a row (companygraph/meta-model#148), so the plugin calls it rather than copying it. The pin moves to v0.46.0 by name and takes v0.43.0 to v0.45.0 in with it; the one thing any of them broke here was the skills test, since v0.44.0 carries a fourth skill, and the pin test now holds the lockfile to the pin as well.

The vocabulary reads the form as an offer of its own and reads the two columns it names as the column of types and the column of owners. The reader of a file's references yields a row's `Entity` cell as a reference of the row's type that carries the row's owner, and the `Owner` cell as a reference to the owning type, as a qualifier names an entity without drawing an edge; `resolveIn` hands the first to the package's `resolveRow`. Because the references pane, the marks, Rename entity and Delete entity all go through those two, each follows the row once the owner is passed along: the pane lists a question under each entity it rests on and under its row's owner, a name opens on Cmd+click and one its owner does not hold is marked as naming nothing, a rename rewrites an `Entity` cell and every `Owner` cell that names a renamed owner, and a delete lists the rows it would leave naming nothing. Completion reads the row from the cell's context: the `Type` cell offers the core's types, the `Owner` cell the owning type's names, and the `Entity` cell what the package's `rowScope` narrows the row to. New entity offers `question` and the checks hold it with no code here, and tests hold both. `AGENTS.md` names `ownerTypesOf`, `rowScope` and `resolveRow` among the package readers the plugin calls; `ownerTypesOf` is read once per vocabulary load, and the other two once per `by` cell resolved or completed, since each reads the schemas again on every call.

`e2e/question.e2e.ts` gives its vault copy the bundled question schema and one question, since the fixture's core predates the type, and works the pane, Cmd+click and the unresolved mark, completion in the `Type` and `Entity` cells, and a rename of the owner. This is 0.10.0, a minor, and it goes into the owner's vault before either instance takes core 0.40.0, since an older plugin refuses that core. The plan is `docs/superpowers/plans/2026-09-24-a-question-row-is-written-in-the-vault.md`.

Verified: on the pushed head npm run typecheck, npm test and npm run e2e, which no job runs, all pass, with `e2e/question.e2e.ts` passing three runs in a row alone and its mark and completion tests failing on the build before their source change; sh conventions/conventions-format and sh conventions/conventions-check exit 0.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr checks --watch
```

Expected: the pull request's URL, then `test` and `conventions / conventions` passing. Then stop: the merge, the `0.10.0` tag and its release, and installing it into a vault each wait for the owner's word.

## After the merge, on the owner's word

Tag `0.10.0` on a detached `origin/main` (this repository's tags carry no `v`), build, and `gh release create 0.10.0 main.js manifest.json styles.css` with notes in the shape of 0.9.1's: what reaches a vault first (a question's `## Rests on` completes, links, marks and follows Rename and Delete; the bundled checker is meta-model v0.46.0 with core 0.40.0), then what a vault must do (nothing; a vault on an older core is checked as before). Install it into the owner's vault before either instance takes core 0.40.0, and only then are the instances' upgrade pull requests clear to merge.

## What this plan does not do

It does not seed a question in either instance, or move `INSTANCE_COMMIT` in `scripts/fixtures.mjs`: no instance carries a question until after this release, and once the reference instance does, the e2e file can drop the schema and the question it writes into its vault copy, a small change of its own. It does not mark an `Owner` cell filled on an unowned type, or a `Type` cell naming no type, in the editor: neither is a name of anything the plugin could resolve, and the checks name both in the pane with the row tinted.
