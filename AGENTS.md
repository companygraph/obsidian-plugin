<!-- conventions · v1.18.0 -->
Shared conventions of the robertblust, guestgraph and companygraph organizations live in
`conventions/`, vendored from robertblust/conventions at the release `conventions.json`
names. Read them before writing or committing anything here.

- `conventions/WRITING.md` — how we write: one voice, three registers, English and German.
- `conventions/WORKING.md` — how we work with git and GitHub.
- `conventions/REPOSITORIES.md` — the family: what each repository is and what pins what.
- `conventions/WRITER.md`, `conventions/TRANSLATOR.md`, `conventions/GLOSSARY.md` — the two roles that
  make a text, and the terms they keep.

Everything below this block is this repository's own. `sh conventions/conventions-sync check`
says whether the copy matches the release, `sync` brings it to the release the pin names, and
`sh conventions/conventions-check` holds this repository's own Markdown to `WRITING.md`. Edit
a shared file in robertblust/conventions, never here.
<!-- end conventions -->

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
never written here.** The family keeps one definition of the slug, of table reading, of section
reading, of how a Type cell and an enum's values are read, and a second copy in a plugin is the
drift that rule exists to prevent. Where the package exports a reader the plugin calls it:
`tableOf`, `sectionsOf`, `typeOfPath`, `declarationOf`, `enumTokensOf`, `isNewer`.

What the plugin reads for itself is stated here, so that the sentence above stays true.
`src/locate.ts` reads a failure's message to find its file and line; it stands only until the
checks return a structure, and is deleted on that day. `src/vocabulary.ts` reads a schema's
tables by their column names and tests four cell values the package reads only inside closures
it does not export: `Yes` under Required, a Type that opens `array of `, the Type `enum`, and a
Section cell that opens `## `. `src/context.ts` knows a frontmatter fence and the shape of a key
line and of a list item, because where a cursor stands is the plugin's own question, and
`src/tables.ts` knows that a line opening `## ` is the section a table sits under; the table
itself it reads with the package's `tableOf`, in Live Preview as in Source mode. None of
these decides whether an entity is valid, each is a candidate for an export upstream, and the
design's section on what goes upstream lists them.

## Layout

Everything that decides anything is a pure module under `src/`, with a test beside it under
`test/`: `manifest.ts`, `model.ts`, `locate.ts`, `context.ts`, `vocabulary.ts`, `candidates.ts`,
`properties.ts`, `report.ts`, `tables.ts`, `scope.ts`.
The modules that touch Obsidian, `vault.ts`, `marks.ts`, `pane.ts`, `suggest.ts`, `addfield.ts`,
`widget.ts`, `livetable.ts` and `main.ts`,
are kept thin because nothing here can run them; they are proven by hand on the reference
instance. No module under `src/` imports from `node:`, because the plugin also runs on a phone.

The tests run under Node's own type stripping, so a source file uses only syntax that erases: no
enum, no parameter property, no namespace, a relative import named with its `.ts`, a type
imported with `import type`.

## Checks

`npm run typecheck`, `npm test` and `npm run build`. The job `test` runs those three, and
`conventions / conventions` is called from robertblust/conventions at the pinned tag; both run
on every pull request and on `main`. `npm test` fetches its two fixtures first, the meta-model at the pinned tag and
the reference instance at the commit `scripts/fixtures.mjs` names.

## The pin

`companygraph-meta-model` is pinned by tag in `package.json`, and the pin is editorial: it moves
in a commit that says why. Move it by installing the package by name,
`npm install companygraph-meta-model@github:companygraph/meta-model#<tag>`, never by editing the
line, because an edited line leaves the lockfile on the old release and everything still builds.
`test/pin.test.ts` fails when the two disagree. Do not install `@codemirror/state` or
`@codemirror/view` by name: `obsidian` pins exact versions of both as peers.
