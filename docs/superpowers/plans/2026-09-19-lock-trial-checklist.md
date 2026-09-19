# Declared headings locked — what to try

The build is in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload Obsidian
with Cmd+P, "Reload app without saving". Try each step in Live Preview first, then in Source mode.
None of this has run inside Obsidian yet, so every step is a question. Undo your edits afterwards
with `git checkout -- model/`.

## What is refused

1. In `model/proficiency-levels/expert.md`, put the cursor in `## What it means` and type a letter.
   Nothing should change, and a notice should say the heading is the schema's.
2. Press Backspace at the end of that heading, and Delete at its start. Nothing should change.
3. Type a letter into `# Expert`. Nothing should change, and the notice should say the H1 is the
   entity's name.
4. Select from the middle of the section above a heading to the middle of the section below it,
   and press Delete. Nothing should change, since the heading is inside the selection.
5. Select all and press Delete. Nothing should change.
6. Hold a key down on a heading. There should be one notice, not a stream of them.
7. Put the cursor in the middle of `## What it means` and press Shift+Enter. Nothing should
   change. Then run "Toggle heading 3" from the command palette on it: nothing should change.

## What passes

8. Put the cursor at the end of a heading and press Enter. A new line opens below it.
9. Put the cursor at the start of a heading and press Enter. A new line opens above it, and the
   heading moves down unchanged.
10. Type, delete and paste freely inside a section's text, and in a heading of your own such as a
   `## Notes` you add.
11. A blank line directly below a heading: put the cursor on it and press Backspace. The blank
    line should go, and the heading should stay as it is.
12. The × on an optional heading still removes its section, and one Cmd+Z brings it back.
13. Type a few words in a section's text, then press Cmd+Z and Cmd+Shift+Z. Undo and redo work as
    always.
14. Click a dashed line for a missing section: the heading is written as before.

## What the review found

- Type `---` as a new first line of a page without frontmatter. It should be accepted.
- Paste a second copy of `## What it means` below the first, then delete the copy. The deletion
  should be accepted.
- Type two spaces at the end of a heading, then delete them. Both should be accepted, since
  trailing spaces are no part of the heading.

## A new entity

15. Create a new note in `model/skills/` and type `# ` and a name, letter by letter, with a few
    corrections. Every letter should be accepted.
16. Close the note and open it again. The H1 should now be locked.

## Obsidian's own changes

17. With `expert.md` open, change its heading in another editor or with `git checkout` on a
    modified copy. Obsidian reloads the file, and the editor should show the file as it is on
    disk, not refuse it.
