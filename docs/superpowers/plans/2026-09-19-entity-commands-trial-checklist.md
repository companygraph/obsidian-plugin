# Rename entity and Delete entity — what to try

The build is in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload Obsidian
with Cmd+P, "Reload app without saving". None of this has run inside Obsidian yet, so every step is
a question. Both commands change files, so afterwards put the vault back with
`git checkout -- model/` and `git clean -n model/`, then `git clean -f model/`. Anything deleted is
in the system's trash as well.

## Rename entity

1. Open `model/proficiency-levels/expert.md` and run `CompanyGraph: Rename entity`. The dialog
   should hold the name `Expert`, selected.
2. Type `Master` and press Review. The dialog should list the move of `expert.md` to `master.md`
   and every profile file whose Skills rows name Expert, with a count each.
3. Press Rename. The note should now read `# Master`, its file should be `master.md`, and the pane
   should say the mechanical checks pass. Open a profile: its rows should say `Master`.
4. Rename a phase, for example `Plan` in `model/processes/delivery/phases/`. The process's Phases
   table and the phase before it in the chain should follow.
5. Try the name of another level, such as `Familiar`. Review should say that name is taken, and
   Rename should write nothing.
6. Rename an experience. Its file should keep its name, since an experience's filename is chosen.
7. Rename the process `Delivery`. Its folder should move with everything in it.
8. Rename an achievement kind, such as `Architecture`. The `### Architecture` headings in the
   experiences' Achievements sections should follow, and Review should count them.
9. Try the name `Plan | Next`. Review should refuse it, since a pipe would split a table cell.

## Delete entity

10. Open a skill that profiles claim and run `CompanyGraph: Delete entity`. The dialog should list
   the file and every file that names the skill, before anything happens.
11. Press Cancel. Nothing should change.
12. Run it again and press Delete. The file should go to the trash, and the pane should list each
    reference that now names nothing.
13. From a process, the dialog should list the process's whole folder, and only references from
    outside it.
14. Open `model/vision.md` and run Delete entity. The dialog should say the model holds exactly one
    vision, and offer no Delete button.
