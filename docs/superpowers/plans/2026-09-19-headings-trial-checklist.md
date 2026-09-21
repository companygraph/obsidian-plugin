# Headings marked — what to try

The build is in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload Obsidian with Cmd+P, "Reload app without saving". Try each step in Live Preview first, then in Source mode. None of this has run inside Obsidian yet, so every step is a question. Undo your edits afterwards with `git checkout -- model/`.

## The marks

1. Open `model/proficiency-levels/expert.md`. At the end of the `## What it means` line, is there
   a small lock, faint until the pointer is on the line? Hovering the lock should show "Required by
   the schema: cannot be renamed or removed."
2. Open `model/roles/writer.md`. Its `## References` is optional. Does that heading show a lock and
   an ×, while the three above it show a lock alone? Hovering the lock should show
   "Optional: cannot be renamed.", and hovering the × should show "Remove this section".
3. Add a line `## Notes` at the end of any entity. Does it show an open circle, whose hover says
   "Not in the schema, yours to edit."?
4. Look at the marks in the dark theme as well. Are they visible without shouting?

## A missing section

5. In `expert.md`, delete the whole `## What it means` section. Does a dashed line reading
   `## What it means` appear where the section was? The pane should list the failure within a
   couple of seconds.
6. Click the dashed line. The heading should be written back with a blank line above it, and the
   cursor should stand on the line below it, ready for text. The dashed line and the failure
   should go.
7. In `writer.md`, delete the whole `## What it produces` section, which sits between two others.
   Does the dashed line appear between `## What it takes` and `## What it never does`?

## Remove section

8. Click the × on an optional heading. The section should go whole, down to the next heading.
   Does one Cmd+Z bring all of it back?
9. Put the cursor inside a required section and run `CompanyGraph: Remove section` from the command
   palette. Nothing should be removed, and a notice should say the section is required.
10. Same inside your own `## Notes` section: the notice should say it is not in the schema.

## A near miss

11. In `model/profiles/robert-blust/experiences/1999-ubs-trainee.md`, which has no `## References`,
    add `## Referencs` at the end. Does the circle's hover
    ask "Did you mean "References"? Click to rename it."? Click it: the heading should be renamed,
    and the mark should turn into a lock and an ×.
12. Add `## references` in lower case to a page that already has `## References`. It should be
    your own heading with no hint, since the page already carries the real one.

## The edges

13. Clicking a mark should not move the cursor or open the heading's source in Live Preview.
14. Switch to another file in the same tab and back: do the marks follow the file?
15. Disable and enable the plugin: the marks and the dashed lines should go and come back.
16. In Live Preview, click into a cell of `writer.md`'s References table and type. No dashed line
    or mark should appear inside the cell: a cell has its own small editor, and the plugin should
    leave it alone.
17. Remove the last section of a page with its ×. The page should end right after the text above
    it, with no blank line left over.
