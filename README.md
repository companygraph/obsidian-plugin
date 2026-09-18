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
bar. A click on the status bar opens the pane, and so does the command `CompanyGraph: Open the
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
they are found at all. On an empty entry of a list and in an empty cell the popup waits for a
first letter, because Enter there ends the list or the row; the command `CompanyGraph: Complete
here` opens it anyway, and takes a hotkey in Obsidian's settings. Nothing is offered while text
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
command `CompanyGraph: Add a field` opens it too. Completion works in Source
mode and with properties shown as source; the spec's open questions say what is known about Live
Preview.

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
