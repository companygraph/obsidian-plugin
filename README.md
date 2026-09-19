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
files, and shows the result in a pane that lists the failures by file and then what was not
checked, as a mark on the line of each failure in the open file, and as a count in the status
bar. The pane's text can be selected and copied, and Copy report puts the whole of it on the
clipboard as plain text, for an agent or an issue. A click on the status bar opens the pane, and
so does the command `CompanyGraph: Open the
checks pane`. `CompanyGraph: Check the instance now` runs the checks without waiting for a
change, which is also how a vault that has only just become an instance is first read.

The status bar says `pin differs` when `tooling` in the manifest names another release of the
checker than the one this build bundles. The checks still run, because the instance's CI is the
gate for that pin: move the pin and the workflow line together, or take the plugin release that
bundles the release the manifest names. A vendored core newer than the bundled checker is
refused instead, and the pane names both releases.

While typing it offers what the file's schema declares: the frontmatter fields the file lacks,
the permitted values of an enum, the canonical names of the type a reference declares, the same
by column in a table section, and the sections the file lacks. A name is inserted plain, as the
conventions write a reference; the plugin resolves it and Obsidian's own graph view does not see
it. An empty line in the frontmatter lists every field the file may still take, which is how
they are found at all. An empty entry of a list and an empty cell show everything they may hold
as well; there Enter and Tab stay the editor's while nothing is typed, so they end the list, add
a row or move to the next cell as they always did. Moving in the list with an arrow key is
choosing, and from then on Enter and Tab accept; a click accepts at any time. The command
`CompanyGraph: Complete here` opens the popup again after it was closed, and takes a hotkey in
Obsidian's settings. Nothing is offered while text
follows the cursor on its line, or in its cell, because accepting would leave that text standing
behind the inserted name.

In Live Preview the frontmatter is Obsidian's Properties widget, and its own Add property lists
every property name used anywhere in the vault: a long list that knows no schema, in which a
field no file uses yet does not appear at all. In a note that is an entity, pressing Add property
opens a picker instead, with exactly the fields this file's schema declares and the file lacks,
the required ones first; it adds the chosen one and puts the cursor into its value. Its last
entry hands over to Obsidian's own list, for a property the schema does not declare, which the
checks will then report. Obsidian's own command Add file property opens the same picker in an
entity, and so does typing `---` at the top of an empty one, which runs that command; the
command `CompanyGraph: Add a field` opens it too.

Frontmatter completes as text in Source mode, and with properties shown as source. A table
completes in both modes: in Live Preview, where Obsidian draws a table as its own widget and
edits one cell at a time, a cell offers what its column declares, named by the same header the
checks read, and a failing row is tinted with its message as the tooltip. An empty cell that is
clicked into shows its list at once; one reached with Tab or an arrow key waits for a letter, or
for `CompanyGraph: Complete here`, so that a list is not in the way of moving through a table. A table whose
separator row carries alignment colons is not a table to the checks and gets no completion in
either mode, and a cell holding a line break gets none in Live Preview.

A name a schema declares as a reference is styled as a link, in Source mode, in the Properties
widget and in a table in Live Preview, and one that names nothing as an unresolved link.
Cmd+click, or Ctrl+click, opens the entity it names; a plain click still edits, since a name is
text and not a link. It resolves as the checks do, by its declared type, and for an owned type
within the owner the file is in. The model's edges are also added to what Obsidian draws its
graph view, local graph and backlink count from, so an entity's neighbors there are the ones the
model names. The backlinks pane's list of linked mentions is drawn from real links only and does
not show them.

Obsidian's table editor rewrites a whole table the moment one cell is edited, every column padded
to its widest cell, and undo gives back the cell but not the padding, so a note that was only
opened carries a diff. In a vault that vendors the family's conventions at a release with
`conventions/markdown.markdownlint-cli2.jsonc`, any vault and not only an instance, the plugin
writes a note back into that Markdown form when the note is left, and when Obsidian quits: the
same rules and the same markdownlint that `conventions-format` runs in CI, so the note comes out
byte for byte as the CI's fix would write it, and an edit that was undone leaves no diff at all.
Not while the note is edited, because the table editor would pad the table again at the next key.
A note still open in another tab is changed in its editor and saved as any edit is. The folders
`conventions.json` excludes are left as they are, and `CompanyGraph: Write this note in the
family's Markdown form` does it at once and says when there is nothing to do.

## Installing it

Copy `main.js`, `manifest.json` and `styles.css` from a release into
`.obsidian/plugins/companygraph/` in the vault, or point BRAT at this repository. Then, in
Obsidian's settings under Community plugins, turn community plugins on and switch CompanyGraph
on in the section Installed plugins; Browse, above it, searches Obsidian's public directory,
where this plugin is not listed. Completion is written for Source mode, which the command
`Toggle Live Preview/Source mode` reaches. An instance that is a git repository keeps `.obsidian/` in its
`.gitignore`.

## Working on it

Node 24 or newer, because the tests run TypeScript through Node's own type stripping. `npm
install`, then `npm test`, which first fetches its fixtures over the network, the meta-model at
the pinned tag and the reference instance at one commit, then `npm run typecheck` and `npm run
build`. The design, with every decision and its reason, is in `docs/superpowers/specs/`.

## License

[Apache 2.0](LICENSE).
