# Tables in Live Preview — what to try

The build is already in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload
Obsidian with Cmd+P, "Reload app without saving". Work in your normal view, Live Preview, in
`model/profiles/robert-blust/robert-blust.md`, whose `## Skills` table has the columns Skill,
Level and Evidence. None of this has run inside Obsidian; every step is a question. Undo your
edits afterwards with `git checkout -- model/profiles/robert-blust/robert-blust.md`.

## Completion in a cell

1. Click into the last row's first cell and press Tab until Obsidian adds a new row, or
   right-click a row and add one below. In the new row's **Skill** cell type `Ja`. Does a popup
   offer skills that match?
2. Accept with **Tab**. Then switch to Source mode and look at the row: is the name in the note,
   not only in the cell? This is the step that matters most: the cell has its own small editor,
   and the name has to travel from it into the note.
3. In the **Level** cell of the same row, type nothing. Does the popup list the proficiency
   levels at once? Press **Enter**: it should move on as Enter does in a table, a new row or the
   cell below, and insert no level.
4. In the Level cell type `Ex` and accept with **Enter**. Is `Expert` written?
5. In the **Evidence** cell type anything. Nothing should be offered; that column is prose.
6. Press Cmd+Z once after an accept. Does one undo put the cell back?
7. Click into the **header** row's cells. Nothing should be offered there.

## The tint on a failing row

8. Leave a wrong skill such as `Jaxx` in the new row and click outside the table. Within a couple
   of seconds the pane should list the failure. Is that **row tinted red** in the table, and does
   hovering the row show the message as a tooltip?
9. Is it the right row? Put the wrong name into a row in the middle of the table and check again.
10. Correct the name. Does the tint go away?
11. With a failing row in place, scroll the table far out of view and back, and wait a moment.
    Is the row tinted again?
12. Click the failure in the pane. Does the note come forward with the table in view?

## The edges

13. Run `CompanyGraph: Complete here` from a hotkey while the cursor is in an empty Skill cell.
    Does the popup open and the cell stay open? From the command palette the cell may close,
    because the palette takes the focus; say what happens.
14. In Source mode, change the table's separator row to `| :--- | --- | --- |`. No completion is
    expected in that table now, in either mode, because the checks do not read such a table as a
    table. Put it back.
15. Put `<br>` into a Skill cell, so it holds two lines in Live Preview. No completion is
    expected in that cell.
16. Disable and enable the plugin with a failing row in place: the tint and its tooltip should go
    and come back.

## Added after the first test: the list on entering a cell

The owner confirmed steps 1 to 4 and asked for the full list at once in an empty cell.

17. **Click** into an empty Skill cell. Does the list of skills open by itself?
18. With that list open and nothing typed, press **Tab**. It should move to the next cell and
    insert nothing. Click into an empty cell again and press **Enter**: it should do what Enter
    does in a table and insert nothing.
19. Click into an empty cell, press **ArrowDown** twice, then **Enter**. The highlighted name
    should be written. Same with Tab in place of Enter.
20. Move through a row of empty cells with **Tab** only, without clicking. No list should open,
    and no cell should be filled.
21. In the frontmatter in Source mode, on an empty `  - ` entry: ArrowDown, then Enter, writes the
    name; Enter alone still ends the list.
