<!-- conventions · v1.33.0 -->
Shared conventions of the robertblust, guestgraph and companygraph organizations live in `conventions/`, vendored from robertblust/conventions at the release `conventions.json` names. Read them before writing or committing anything here.

- `conventions/WRITING.md` — how we write: one voice, three registers, English and German.
- `conventions/WORKING.md` — how we work with git and GitHub.
- `conventions/REPOSITORIES.md` — the family: what each repository is and what pins what.
- `conventions/WRITER.md`, `conventions/TRANSLATOR.md`, `conventions/EDITOR.md`,
  `conventions/BACKREADER.md`, `conventions/GLOSSARY.md`, `conventions/GERMAN.md` — the four roles
  that make a text, the terms they keep and the German they write.

Everything below this block is this repository's own. `sh conventions/conventions-sync check` says whether the copy matches the release, `sync` brings it to the release the pin names, and `sh conventions/conventions-check` holds this repository's own Markdown to `WRITING.md`, and `sh conventions/conventions-format` to its one form, which `fix` writes. Edit a shared file in robertblust/conventions, never here.
<!-- end conventions -->

# AGENTS.md

Guidance for agents working in this repository. The design is `docs/superpowers/specs/2026-09-18-obsidian-plugin-design.md`; read it before anything else.

## What this is

An Obsidian plugin that checks a CompanyGraph instance as it is edited and completes what its schemas declare. It runs the parser and the checks of `companygraph/meta-model`, bundled at the release `package.json` pins, over the vault, and reads the schemas from the core the vault vendored.

## No rule is implemented here

**A rule the plugin needs that the package does not export is proposed to the meta-model and never written here.** The family keeps one definition of the slug, of table reading, of section reading, of how a Type cell and an enum's values are read, and a second copy in a plugin is the drift that rule exists to prevent. Where the package exports a reader the plugin calls it: `tableOf`, `sectionsOf`, `typeOfPath`, `declarationOf`, `enumTokensOf`, `isNewer`, and for a `ref → by <Column> in <Owner>` row, `ownerTypesOf`, `rowScope` and `resolveRow`.

What the plugin reads for itself is stated here, so that the sentence above stays true. `src/locate.ts` reads a failure's message to find its file and line; it stands only until the checks return a structure, and is deleted on that day. `src/vocabulary.ts` reads a schema's tables by their column names and tests four cell values the package reads only inside closures it does not export: `Yes` under Required, a Type that opens `array of `, the Type `enum`, and a Section cell that opens `## `. `src/context.ts` knows a frontmatter fence and the shape of a key line and of a list item, because where a cursor stands is the plugin's own question, and `src/tables.ts` knows that a line opening `## ` is the section a table sits under; the table itself it reads with the package's `tableOf`, in Live Preview as in Source mode. `src/references.ts` knows the same of a key line, a list item and a section, and splits a table row into cells on every pipe, as the package's reader splits it, to know where a cell sits on its line; what the columns are called it takes from `tableOf`. None of these decides whether an entity is valid, each is a candidate for an export upstream, and the design's section on what goes upstream lists them.

The Markdown form written back into a note is the conventions', not a rule of this repository: `src/form.ts` reads the rule set from the vault's own copy, `.markdownlint-cli2.jsonc` at its root since conventions v1.21.0 and `conventions/markdown.markdownlint-cli2.jsonc` before it. Both are read, newest first, because a vault takes a release when its owner says so and one still on the older layout must keep its form. It takes the one custom rule from this repository's own vendored `conventions/markdown-rules.cjs`, and runs markdownlint, pinned exactly in `package.json` to the release conventions-format's CLI runs. `test/pin.test.ts` fails when a conventions release moves the CLI and the plugin's markdownlint has not moved with it.

## Layout

Everything that decides anything is a pure module under `src/`, with a test beside it under `test/`. A module is Obsidian's when it imports `obsidian` or `@codemirror/`, and those are kept thin because the unit suite cannot run them. No module under `src/` imports from `node:`, because the plugin also runs on a phone.

`npm run e2e` runs what the unit suite cannot: it starts Obsidian on a copy of the pinned reference instance and works the plugin with real clicks and keys, and `docs/superpowers/specs/2026-09-20-run-in-obsidian-design.md` says how and why. **A change to a module that imports `obsidian` or `@codemirror/` runs `npm run e2e` before its pull request, and the `Verified:` line says that it ran.** A defect found in Obsidian gets its test under `e2e/` first, seen to fail, as a defect in a pure module gets its unit test first, and a test of a defect is also seen to fail on the release that had it, with `E2E_PLUGIN_DIR` naming a folder that holds that release's three files. A test there is handed a driver and never imports the transport, never sleeps a fixed time to let something happen, and reads the pinned fixture, never a live vault. Inside a function handed to the driver `app` is Obsidian's own global and is untyped, so the type check will not catch the driver being called by that name: the driver is `ui`. A condition is read for its truth, so one that collects what went wrong answers null and not an empty list. `e2e/commands.e2e.ts` fails for a command no test runs, so a new command arrives with its test. What only a person can judge, whether a mark is strong enough or a list reads well, is still tried by hand.

Those are rules and not a list. `test/layout.test.ts` holds each of them, so a module added on either side of the line is placed by what it imports rather than by anyone remembering to write it down here. This paragraph used to name every module instead, and the list was wrong within a week: it named thirteen pure modules while there were twenty-three.

The tests run under Node's own type stripping, so a source file uses only syntax that erases: no enum, no parameter property, no namespace, a relative import named with its `.ts`, a type imported with `import type`.

## Checks

`npm run typecheck`, `npm test` and `npm run build`. The job `test` runs those three, and `conventions / conventions` is called from robertblust/conventions at the pinned tag; both run on every pull request and on `main`. `npm test` fetches its two fixtures first, the meta-model at the pinned tag and the reference instance at the commit `scripts/fixtures.mjs` names.

`npm run e2e` is run by hand and by no job. It needs Obsidian installed, at `OBSIDIAN_BIN` or where macOS puts it, and says it was skipped where there is none; it opens a window and takes the keyboard while it runs. A test that fails leaves a screenshot and the page's errors under `e2e/failures/`, which git ignores. `npm run e2e:coverage` runs it with the protocol's coverage switched on and prints, module by module, how much of the plugin ran and which functions were never entered; `scripts/e2e-coverage.mjs` says at its head what that number does and does not show.

## The pin

`companygraph-meta-model` is pinned by tag in `package.json`, and the pin is editorial: it moves in a commit that says why. Move it by installing the package by name, `npm install companygraph-meta-model@github:companygraph/meta-model#<tag>`, never by editing the line, because an edited line leaves the lockfile on the old release and everything still builds. `test/pin.test.ts` fails when the two disagree. Do not install `@codemirror/state` or `@codemirror/view` by name: `obsidian` pins exact versions of both as peers.
