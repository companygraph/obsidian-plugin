# Sections and entities scaffolded — what to try

The build is in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload Obsidian
with Cmd+P, "Reload app without saving". None of this has run inside Obsidian yet, so every step is
a question. Undo your edits afterwards with `git checkout -- model/` and delete any new files with
`git clean -n model/` first, then `git clean -f model/`.

## Add a section

1. Open `model/profiles/robert-blust/experiences/1999-ubs-trainee.md` and run `CompanyGraph: Add a
   section`. Does the list show only sections the page lacks, `References` among them?
2. Choose `References`. The heading should appear where the schema puts it, followed by the table's
   header row and a separator row, and the cursor should stand on the line below them.
3. Run it again: `References` should no longer be offered.
4. In `model/roles/writer.md`, delete `## What it produces` whole, then click its dashed line. The
   heading comes back as before. Then remove `## References` with its ×, and add it back with the
   command: its table header should be written with it.

## New entity

5. Run `CompanyGraph: New entity` from `model/roles/writer.md`. The list should show the types with
   their folders, and no phase or experience, since a role is in no owner.
6. Choose `role`, type the name `Critic` and press Enter. `model/roles/critic.md` should open with
   `source:`, `# Critic`, an empty `> ` line with the cursor on it, and the three required
   sections. The pane should list the empty `source` and nothing about a missing section.
7. From `model/processes/delivery/delivery.md`, run it again. `phase` should now be offered, going
   into `model/processes/delivery/phases/`.
8. From `model/profiles/robert-blust/robert-blust.md`, choose `experience`. The dialog should ask
   for `start` too. With the name `Test Period` and start `2027-01`, the file should be
   `model/profiles/robert-blust/experiences/2027-test-period.md`.
9. Try a name that exists already, such as `Writer` as a role. A notice should say the file exists,
   and nothing should be written.
10. `vision` should not be offered at all, since `model/vision.md` exists.
