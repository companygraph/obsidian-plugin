# The widget completes what the schema declares implementation plan

> **For agentic workers:** this plan records work built as a prototype in a scratch clone and moved to the branch whole; its tasks are the commits on the branch, and its code is theirs.

**Goal:** In Live Preview, the Properties widget completes the fields a schema declares from the schema, so a role removed from the one file that held it is offered again the moment it is gone.

**Architecture:** Obsidian's own suggestions in the widget are the values the vault's files hold, so they know no schema and lose a value the moment the last file drops it, which is what the owner met. A declared field's input gets a suggest of the plugin's through Obsidian's public `AbstractInputSuggest`: `propertyCandidates` in `candidates.ts` decides what is offered, pure and unit-tested, and `propertysuggest.ts` attaches it. Three things about the widget shaped the attaching, each found by a test in a real Obsidian: the widget is drawn after the plugin's paint and redrawn on every edit, so each view is watched for rows as they are added; Obsidian's suggest opens the moment an input takes the focus, so the attaching has to be there before any focus, and its `focus` and `input` handlers are stopped in the capture phase, where a later listener runs first, and the plugin's suggest is driven through the method the class runs on an input, read from the installed application; and a row drawn before the rebuild read the schema that declares its field is passed over, so the paint that follows every rebuild attaches again. The row is found from the input at each query, since a row kept from the attaching is the one before the edit.

**Tech Stack:** TypeScript run by Node's type stripping, `node:test`, esbuild, Obsidian's `AbstractInputSuggest`; the e2e suite under `e2e/` driving a real Obsidian.

**Spec:** the owner's report of 2026-09-22 and the design agreed in conversation: frontmatter only, the widget's completion replaces Obsidian's on declared fields, a plain string field keeps Obsidian's.

Every code block on the branch was run in a throwaway clone first: the unit suite, the new e2e file three times in a row, and the full e2e suite once, with `e2e/compliance.e2e.ts` run alone on the changed and the unchanged build when the full run showed it timing out under load.

## Global Constraints

- **Frontmatter only.** Table cells and section headings complete through the editor already and are not touched.
- **A declared field's input shows one list, the plugin's.** A field the schema declares as plain text keeps Obsidian's own.
- **What is offered is what Source mode offers**: the canonical names of the declared type, every one the model holds, less the pills the list already holds; an enum's values; for an `image`, the `.jpg`, `.jpeg` and `.png` files beside the note. Starts-with first, then contains, as `matching` has it.
- **Choosing writes the way the widget writes**: a pill in a list, the value in a single field, through the widget's own Enter; the file is never written directly.
- **A module that imports `obsidian` cannot be loaded by the unit suite**: `propertyCandidates` is pure and tested; `propertysuggest.ts` is held by `e2e/propertysuggest.e2e.ts`.
- **Every step into Obsidian's internals is optional and guarded**: where `onInputChange` or `onInputFocus` is not there, the event passes and both lists show, a failure left visible rather than made silent. The widget's markup, `.metadata-property[data-property-key]`, `.multi-select-input`, `.metadata-input-longtext`, `.multi-select-pill-content`, is the footing the pill styling already stands on.
- **Each e2e test leaves the note as it found it**: Escape leaves what was typed in a widget input, and a list whose last pill goes is redrawn by Obsidian as a text field, so the roles test adds a second role first.
- **Plugin 0.9.0, a minor.** README says what the widget completes.
- **Commit messages** in the git register with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Tasks

1. `propertyCandidates` in `src/candidates.ts`, with its test in `test/candidates.test.ts`.
2. `src/propertysuggest.ts`, wired in `src/main.ts` at load and at the end of `tintTables()`, which `paint()` calls, held by `e2e/propertysuggest.e2e.ts`.
3. README paragraph and version 0.9.0.

## What this plan does not do

Completion in the widget for a field whose schema declares a `qualifier` or a table stays with the editor. The key picker, Add a field, already knows the schema and is not changed. A picture offered under `image` is the file's name; the plugin does not show the picture in the list.
