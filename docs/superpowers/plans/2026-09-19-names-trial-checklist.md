# Names as links and the graph view — what to try

The build is in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload Obsidian
with Cmd+P, "Reload app without saving". Nothing here has run inside Obsidian yet; every step is
a question. On Windows or Linux read Ctrl for Cmd.

## Names look like links

1. Open `model/profiles/robert-blust/robert-blust.md` in your normal view. In the Properties box,
   is `source` coloured as a link, and are the `roles` pills coloured as links?
2. In the Skills and Evidence tables, are the Skill, Level and Experience cells coloured as links,
   and What it shows not?
3. Put a name that does not exist into a Skill cell. Is it drawn as an unresolved link, beside the
   red row tint?
4. Switch to Source mode. Are the same names coloured there, in the frontmatter and in the tables?

## Cmd+click opens what a name names

5. Cmd+click a role pill. Does the role's file open in the same pane?
6. Cmd+click a Skill cell in a table, then click an unrelated checkbox or anywhere in the note.
   The checkbox should toggle normally and the cursor should not jump into a table.
7. Cmd+click an Experience cell. Does your own experience open?
8. Cmd+click `source` in the Properties box. Does the source open, and does the Properties value
   keep its text unchanged?
9. In Source mode, Cmd+click a name in the frontmatter and in a table. Does the cursor stay where
   it was, and does the entity open?
10. A plain click on a name still puts the cursor there, as it always did.
11. With two panes side by side, Cmd+click a name in the pane that is not active. It should open
    in that pane.

## The graph view

12. Open the graph view (Cmd+P, "Open graph view"). Are your entities joined by edges now, where
    before they were mostly separate dots? Expect one large hub: the source "Local", which nearly
    every entity names. Whether that edge should be left out is your call.
13. Open the local graph of a skill. Are the profiles and roles that name it around it?
14. In the status bar, the backlink count of a skill should count the entities that name it. The
    backlinks pane's list of linked mentions will not show them: it reads real links only, which
    is Obsidian's and cannot be fed this way.
15. Type in an entity and watch the graph for a second: does it flicker, or redraw twice?
16. Rename a skill's file, not its H1, then disable the plugin: the backlink count and the graph
    edges should go back to Obsidian's own. Enable the plugin again.
17. Quit Obsidian with the plugin disabled and start it again: the graph shows only Obsidian's own
    links, which confirms nothing was saved.
