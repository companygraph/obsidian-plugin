# CompanyGraph in Obsidian — design

> An Obsidian plugin that checks an instance as it is edited and completes what the schemas
> declare. It runs the meta-model's own parser and checks over the vault, reads the rules from
> the core the vault vendored, and interprets no prose. The agent remains what enforces the
> model.

Status: design agreed on 2026-09-18, nothing built. This is the first spec of this repository;
the repository exists so that the spec has a home, in the order the family keeps for a tool: it
is hand-built and proven on the reference instance, `robertblust/mental-model`, before anything
about it moves into the meta-model.

Reads against three specs in `companygraph/meta-model`: `2026-08-25-companygraph-tooling-design.md`
(the CLI that was designed and not built, and whose `check` this plugin runs), `2026-09-10-instance-checks-design.md`
(the instance checks, and why they read the instance's own core) and `2026-09-15-typed-resolution-design.md`
(references resolve by declared type). Where this spec and the conventions in `core/CONVENTIONS.md`
disagree, the conventions stand and this spec is wrong.

---

## 1. Purpose and non-goals

An instance is a folder of Markdown files with YAML frontmatter, one file per entity, in a
folder named for its type. That is also what an Obsidian vault is, so the reference instance
opens as a vault today with no change to any file. What the vault lacks is the discipline the
instance's CI and agent pass supply: an unresolvable reference is an error, a field the schema
does not declare is an error, and both are found only after the edit, in a workflow run or an
agent's report. This plugin brings the mechanical half of that discipline into the editor,
where the edit is made, and offers the vocabulary the schemas declare while it is typed.

**Owns:**

- reading the vault as an instance: the manifest, the vendored core, the content under
  `model/`
- running the meta-model's checks over the whole instance on every change, and showing the
  result beside the editor
- completion for what a schema declares: frontmatter keys and values, table cells, sections
- the guards a checker keeps between its own release and the core an instance vendored

**Non-goals, decided:**

- **No second implementation of a rule.** The parser, the checks, the slug, the table reader
  all come from `companygraph-meta-model` at a pinned tag. A rule the plugin needs that the
  package does not export is proposed upstream, never written here. The family keeps one
  definition of each of these on purpose, and a plugin with its own copy of `slug` is the drift
  that rule exists to prevent.
- **No judgment.** The writing rules in each schema are checked by the agent pass and by
  nothing mechanical; the plugin names them as unchecked in every report, as the checker and
  the validate skill already do.
- **No wikilinks.** A reference is written as the canonical name of its target, plain, as R3
  states, and the plugin resolves it. Obsidian's own graph view and backlinks see nothing, and
  that is accepted. The alternative, writing `[[name]]` and letting Obsidian resolve it, fails
  twice: Obsidian resolves a link by filename or by an `aliases` field, and filenames are R12
  slugs while an `aliases` field is one the schemas do not declare and R15 forbids; and a name
  is unique within its type, not across the instance, which Obsidian's one namespace cannot
  express. A graph view of the plugin's own, drawn from the parsed instance, is possible later
  and changes no file.
- **Not the CLI.** Creating an instance, adding an entity from its schema and upgrading a
  vendored core are the tooling spec's `init`, `add` and `upgrade`, and they are version two of
  this plugin or a CLI beside it; §8 says what is known.
- **No agent inside the plugin.** An agent runs in the vault folder as it runs in any instance
  today, reading the instance's `AGENTS.md` and its skills. Embedding one would tie the plugin
  to a vendor, and the instance's agent files are already vendor-neutral.

---

## 2. Repository and release

`companygraph/obsidian-plugin`, a member of the family: it vendors `robertblust/conventions` at
a pinned release, opens its `AGENTS.md` with the shared block, carries the four-line `CLAUDE.md`
adapter, keeps a protected `main` with the conventions job and its own suite, and takes the row
`CompanyGraph — Obsidian Plugin` in `REPOSITORIES.md`. Apache 2.0, like everything the
organization owns.

TypeScript, built with esbuild into the three files Obsidian installs, `main.js`,
`manifest.json` and `styles.css`, in the layout the Obsidian sample plugin uses. The plugin id
is `companygraph` and the display name is CompanyGraph; Obsidian's directory guidelines keep the
word Obsidian out of both. `isDesktopOnly` is false, because nothing in version one touches
Node: the parser and the checks are pure functions over a map of path to text, and the vault
API supplies the map on every platform.

One runtime dependency, `companygraph-meta-model`, taken from a tag exactly as the MCP server
and blust.ch take it, `"companygraph-meta-model": "github:companygraph/meta-model#vX.Y.Z"`, and
bundled at build. The pin is editorial and moves in a commit that says why; a test asserts that
the installed package's version equals the pin, because a stale lockfile has built green on an
older release than its pin named three times in this family.

A release is a tag and a GitHub release carrying the three files, in the family's form. Version
one is installed by copying those files into a vault's `.obsidian/plugins/companygraph/` or
through BRAT, which installs from a GitHub release. Listing in Obsidian's community directory is
a later decision (§9), because it adds a review process and a naming constraint the first
release does not need.

---

## 3. What is read, and from where

The vault root is the instance root. The plugin reads `.companygraph/manifest.json` first; a
vault with no manifest is not an instance, and the plugin stays idle in it rather than
reporting on files it has no rules for.

From the manifest it learns the units folder, `meta` in every instance so far, and reads every
file under `<units>/core/` and under `model/` into one map of path to text, keyed relative to
the vault root. Every file and not only the Markdown, because a stray file in the container is
a finding of the structure check and a map that dropped it would hide the thing that check
exists to see; a file that is not text enters the map with empty text, which is all that check
reads of it. That map is what `checkInstance` and `parseInstance` take, with
`core` set to `<units>/core` and `model` to `model`. The schemas come from the vault's own
vendored core and never from the bundled package, for the reason the instance-checks spec gives:
an instance sits on the release it vendored, and a plugin update that re-validated it against
rules it never adopted would turn a green instance red for a change it did not make.

Two guards follow, the same two the checker's command-line form keeps, with one change in
posture. A vendored core newer than the bundled checker is refused, naming the plugin release
to take, because a checker cannot hold an instance to a type it has never heard of and would
report the new folder as a broken model. A `tooling` pin in the manifest that names another
release than the bundled one is reported, in the pane and in the status bar, and the checks
still run. The command-line checker refuses this case because a workflow that calls one release
while the manifest names another is a pin nobody moved, and refusing is what surfaces it. A
plugin that refuses helps nobody in the editor; the mismatch is shown, and it is CI's refusal
that stays the gate.

The map is rebuilt on load and after every change to a file under the two folders,
once typing has paused. Rebuilding the whole map rather than patching one entry keeps the
plugin free of a cache that can disagree with the vault. An instance is small files in the
hundreds, read from disk in less time than typing pauses for, and a cache would buy nothing
a reader of this spec should worry about first.

---

## 4. Validation

The whole instance is checked on every rebuild, because a reference crosses files and a check
that reads only the file being edited cannot see the entity it points at, or the entity that
points at it.

`checkInstance` returns two lists, `failures` and `skipped`, and the plugin shows both. A side
pane, an Obsidian `ItemView`, lists the failures grouped by file, each entry opening the file at
the line found for it, and ends with what was not checked: the types the vendored core carries
no schema for, which `skipped` names, and the writing rules of every schema, which are the
agent pass's alone. A report that ends that way is the contract every check in this family
already keeps, and a pane that showed a green list and nothing else would be read as a
validated instance, which it is not.

A failure is a string. Most begin with the path of the file they are about, `model/skills/x.md:
…`; a few, such as two files sharing a canonical name, name no path. The plugin maps a failure
to a file by that leading path when it has one, and to the instance root when it does not; it
maps to a line by searching the file for the value the message quotes, the reference that did
not resolve or the field that is not declared, and falls back to the first line. A quoted
`## Section` is where the search starts and never its answer, and a line that holds the value
whole, as a scalar, a list item, a cell or a heading, is preferred over one that merely contains
it, because a half-typed name is contained in many lines and is whole on one. This mapping
is admitted to be a reading of prose, the kind the meta-model's own boundary in the tooling
spec rules out for schemas, and it is kept only until §7's structured failure lands upstream.
The file mapping is exact because the checks build every path through one constant. The line
mapping is best effort, and the pane does not flag which entries fell back, because a mark one
line off is still on the right file and the entry carries the whole message.

`parseInstance` throws where the checks report: on an unresolvable reference, a duplicate name
within a type, a folder no schema declares. The checks are the fuller report of the same
findings, so the plugin shows the parser's message only when the checks found nothing and the
parser threw all the same, as one failure at the instance root. Completion does not wait for a
parse. A reference is unresolvable for exactly as long as its name is half typed, which is when
completion is wanted, so the names completion offers are those of the last rebuild that parsed;
a vault that has not parsed since it was opened offers keys, enum values and sections, which
come from the schemas, and no names.

The open file's failures are also marked inline, an editor decoration on the line found, with
the message on hover. A status bar item carries the count of failures and the count of things
not checked, so the state is visible without the pane open; a press on it opens the pane, and
it says so in a tooltip, because the first person to use it read the count and did not find the
pane.

**Live Preview is the view most people never leave, and it draws the frontmatter as Obsidian's
Properties widget, where a mark on a text line has nowhere to sit.** The by-hand trial settled
this: without more, a failure in frontmatter was visible only to someone who opened the pane.
Each row of the widget carries its field's name in the markup themes style it by, so a failing
field's row is tinted by a rule scoped to its leaf, and a press on a failure in the pane brings
the note forward and puts the focus into that row's value. Which field a line belongs to, its
own key or the key above an entry of a list, is decided in a tested module. Both lean on markup
and not on the plugin API, which offers neither; if the markup changes, the tint and the focus
go and nothing else does. A row carries no tooltip, and the pane keeps the message.

---

## 5. Completion

Completion offers what a schema declares and nothing it does not. It is an `EditorSuggest`,
the mechanism Obsidian's own link and tag popups use, and it triggers on the cursor's context.
The type of the file comes from its path through the schemas' `## File Location`, which the
checks already resolve as `typeOfPath`; a file whose path names no type gets no completion.

Four contexts, each with its own candidates:

| Context | On | Candidates |
| --- | --- | --- |
| frontmatter key | a line between the fences, at the start | the fields the schema's Frontmatter table declares that the file lacks, required first |
| frontmatter value | after `<key>:` or on a `- ` line under a list-valued key | for `enum`, the listed values; for `ref → <type>` and `array of ref → <type>`, the canonical names of that type; nothing for `string`, `number` and `date` |
| table cell | inside a row of a section the schema marks `Table.` | by column, from the column table: the names of the declared type for a reference, a qualifier or an optional reference column; the listed values for an enum column; nothing otherwise |
| section heading | a line beginning `## ` | the sections the schema declares that the file lacks, required first |

A candidate is inserted plain: the name, the value, the key with its colon, the heading. Nothing
is wrapped in brackets, per §1. A reference column's candidates are the names of the type the
column declares and of no other type, which is R2's resolution rule applied to the offer: a name
that exists only under another type is not offered, because it would not resolve.

The candidate lists come from the parsed schemas and the parsed instance of the last rebuild,
so an entity added a moment ago is offered as soon as its file has been read. What is not
offered is a name for an entity that does not exist; the add-entity skill's rule, never invent
a referenced entity, holds for the editor too, and the diagnostic on the unresolved name is the
prompt to create it.

Four things the by-hand trial decided about when the popup speaks. Nothing is offered while text
follows the cursor on its line or in its cell, because accepting would leave that text standing
behind the inserted name. A value written directly after its colon brings its own space, since
`source:Local` is one bare word to YAML and no field at all. An empty line in the frontmatter
offers by itself, because it is how the fields a file may still take are found at all; an empty
entry of a list and an empty cell wait for a first letter, because Enter there ends the list or
the row and a popup that opened first would take it, and a command opens it on demand, as
completion does in any editor. Enter accepts by Obsidian's default and Tab accepts as well.

**In Live Preview a field is added through the widget, so that is where the schema has to
speak.** Obsidian's own Add property lists every property name used anywhere in the vault and
knows no schema: a long list, in which a field no file uses yet does not appear at all. In a
note that is an entity, a press on that button, Obsidian's own command Add file property and the
`---` typed at the top of an empty note, which runs that command, all open a picker with exactly
the fields the schema declares and the file lacks, the required ones first. It writes through
Obsidian's own writer of frontmatter, leaves the value empty, since a list written as `[]` would
be the flow sequence R11 forbids, and puts the focus into the new value. Its last entry hands
back to Obsidian's list, so it is never the only way on, and the checks report what R15 says of
a field no schema declares. The button is found by its markup and the command by its identifier
in a registry outside the public types, both read from the installed application before they
were relied on; each is wrapped optionally and put back on unload.

---

## 6. Testing

The plugin is split so that what can be tested without Obsidian is most of it. The vault-facing
layer, reading files into the map, the pane, the decorations and the suggest popup, is thin and
calls pure functions: rebuild the model from a map, map a failure to a location, detect the
context at a cursor position in a text, list the candidates for a context. Those pure functions
run under Node's test runner, no test dependency, against two fixtures: the meta-model's
`example/` as the valid instance, and a broken copy with one edit per failure shape the mapping
has to handle, a path-bearing failure, a path-free failure, a message quoting a value that
occurs once and one that occurs twice.

The vault-facing layer is proven by hand on the reference instance, which is what the family's
order for a tool requires: `robertblust/mental-model` gains a `.obsidian/` line in its
`.gitignore` and nothing else, and the plugin is run there against edits made to fail. The
findings from that go into §9 of this spec before version two is designed, as the reference
instance's findings went into the tooling spec.

CI runs the suite, the build and the conventions check on every pull request and on `main`; the
pin test of §2 is part of the suite.

---

## 7. What goes upstream

**A structured failure.** The checks return strings today, and §4's mapping reads them. The
plugin is the first consumer that needs to know which file and which line a failure is about,
and it shows what the shape has to carry: the path, the rule cited, the value quoted and, where
the checker knew it, the position. That is a change to `lib/checks.mjs` and a minor release of
the meta-model, proposed once the plugin has run on the reference instance and the shape is
known from use rather than guessed. Until it lands, the string mapping stands, and the day it
lands the mapping is deleted rather than kept as a fallback.

**Two readers, exported.** Completion reads a schema's Type cells and an enum's permitted
values, and the package has one reader of each, `declarationOf` in `lib/instance.mjs` and
`enumTokensOf` in `lib/checks.mjs`, neither exported. §1 rules out a second copy, so both are
exported upstream in a minor release, and that release is what the plugin's completion pins.
Validation needs neither and is built against the release before it.

**A reader of a schema's rows, and of a grouped section.** The package reads whether a field is
required, whether it is a list and whether it is an enum inside closures it does not export, and
the plugin's vocabulary reads the same cells by their column names; `AGENTS.md` lists each
reading it holds. One exported reader that returns a type's fields, sections and columns as the
checks see them would retire all of them. The same release could export the reader of a grouped
section's heading table, which is what a fifth completion context needs (§9).

**A note on the tooling spec.** `2026-08-25-companygraph-tooling-design.md` designed `check` as
a command in a `tooling` repository; the instance-checks spec of 2026-09-10 amended that by
moving the reader into the meta-model, and this spec is the second consumer of it. The tooling
spec should say so in a line, that `check` ships from the meta-model and runs in CI, in a
shell and in this plugin, so that whoever builds `init`, `add` and `upgrade` does not build
`check` again.

---

## 8. Version two, what is known

Three things were asked for and deferred, in the order they are likely to come.

**Instantiate.** A command that turns an empty vault into an instance: fetch core at a release
from the meta-model's GitHub release, write it under `meta/core/`, write the manifest with a
hash per file, scaffold one folder per root type from the schemas' File Location and write the
agent files. This is the tooling spec's `init`, and the spec's §3 layout is what it produces;
nothing there needs redesign. What needs a decision is whether the same code should also be a
CLI, which is the tooling spec's original form and the natural shape for CI, and whether that
means a library the plugin and the CLI share. That decision waits until the plugin has a user
who is not the owner.

**Add an entity.** A command that writes one entity's shell from its schema, the tooling
spec's `add`, with the H1 as given, the filename by R12 or the type's own derivation, every
field the schema declares and every required section. In the editor it is a natural pair with
completion: the shell first, the vocabulary while the body is written.

**An agent.** Claude Code first; Codex and Gemini's command-line agents both read `AGENTS.md`,
which the instance already carries, so the plugin's part is small: a command that opens a
terminal in the vault folder, or the vault's own agent files kept current by `upgrade`. Nothing
here decides for a vendor. What the plugin never does is call a model itself.

**Content, beyond the frontmatter.** Asked by the owner at the end of the first trial: whether
proposals and completion reach the body of an entity. The body holds four different things and
each has its own answer, in the order they are worth building.

A table is where most references of an instance live, a profile's Skills above all. Its cells
complete in Source mode already; in Live Preview a table is Obsidian's table editor, and
completion there has to learn which column a cell belongs to from inside that editor. Obsidian's
own link suggestions work in those cells, so a suggest is reachable; how the column is found is
not verified and is read from the installed application before anything is planned. The same
work lets a failing row be tinted there.

A section is offered on `## ` already. Beside it belong a picker that adds a section from Live
Preview, built as the field picker is, and the scaffold of a whole new entity, its required
fields and sections written at once, which is the entity command above.

A heading that is a reference, an achievement kind under `## Achievements`, waits for the
export §7 names and is then a fifth context.

Running prose divides. Completing a name inside a sentence is easy and means nothing to the
model: a reference exists only where a schema declares one, so a name in prose is a fact and
draws no edge, and nothing would check it. It is not built unless it is missed. Proposing what
a section should say is the agent's seat and stays there, since the plugin calls no model. What
the plugin can do is show what the schema says of the section the cursor is in, its purpose and
its writing rules, beside the editor: text the vault already holds, a brief for the person
writing and the same brief for an agent started later.

---

## 9. Open questions

- **The community directory.** Listing there means a review, a name without Obsidian in it,
  which is already met, and a release cadence the directory expects. Whether the plugin goes
  there, or stays a release installed by BRAT for a family that has one vault, is decided when
  a second instance wants it.
- **What a consumer other than CI does with the `tooling` pin.** The manifest's `tooling` field
  names the checker release CI calls, and §3 has the plugin report rather than refuse on a
  mismatch. Whether the manifest should name the plugin's release too, or the field should be
  read as the release of the checks and no more, is a meta-model question the structured
  failure's release could settle.
- **Live Preview, what the trial settled and what it left.** Validation works from the
  Properties widget as it does from text: Obsidian saves when a field is committed and the
  failure appears at once. The widget's rows are tinted and focused (§4) and a field is added
  through the schema's picker (§5). Left open: a table is a widget in Live Preview too, so a
  failing row of a profile's Skills table gets no tint and its cells no completion there; a
  value in the widget is completed by Obsidian's own list of values seen in the vault, which
  knows no schema; whether the widget rewrites a list in a form R11 accepts has not been looked
  at; and a window popped out of the main one has its own document and gets neither the tint nor
  the picker.
- **A name that Obsidian's View already uses.** The pane rendered blank on its first run,
  because it had a method named `open` and Obsidian's View has an internal one of that name,
  which is what calls `onOpen`. The public types do not declare it, so the name typechecked and
  no review could see it. Nothing guards against the next such name but running the build.
- **A heading in a grouped section.** An experience's `## Achievements` groups its bullets under
  `###` headings that name an achievement kind, so such a heading is a reference, and §5's four
  contexts do not offer it. Validation catches a wrong one and the locator lands on it. Offering
  it needs the package's reader of a heading table, which is not exported (§7), so it waits for
  that export and is a fifth context when it comes.
- **The editor and the disk can disagree about line endings.** The package reads a file with
  CRLF endings as having no frontmatter, and so do the plugin's checks, which read the disk.
  CodeMirror hands the editor's lines without the `\r`, so completion sees frontmatter the checks
  do not. On a checkout that converts line endings the whole instance would read red while its CI
  is green. The cure is upstream, in how the parser reads a fence.
- **Files Obsidian does not list.** The vault's file list leaves out dot-files, so a stray
  `.gitkeep` under `model/` is a finding in CI and invisible here.
- **No key completion before the closing fence exists.** A new note with only its opening `---`
  has no frontmatter as the package reads it, and the plugin agrees, so keys are offered once the
  block is closed.
- **What the review's probe found about the checks, none of it the plugin's to fix.** No check holds
  a required section, so deleting one passes while completion labels it required. An unresolved
  reference in frontmatter is reported by two checks, so the count in the status bar doubles. And
  two experiences of two profiles that share a name pass every check while the parser refuses
  them, which the plugin shows as one failure on the instance.
- **Mobile.** Nothing in version one needs the desktop, and nothing has been tried on a phone.
  The pane and the popup are Obsidian's own components and should hold; the rebuild on every
  change is where a phone would show first.
- **The line mapping's accuracy.** §4 admits it is best effort. How often it lands a line off,
  measured on the reference instance's failures, is the number that decides how soon §7's
  upstream change is worth its release.
