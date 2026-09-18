# The by-hand trial — checklist

The plan's Task 10, with what three reviews asked a person to settle. The build is already in
`~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Open that folder as a vault,
turn restricted mode off under Settings → Community plugins, enable CompanyGraph, and run the
command `CompanyGraph: Open the checks pane`. Work in Source mode first. Write down what happens
at each step, including "as expected"; the answers go into the design's open questions.

Two things are known before the trial starts. The status bar is empty until the first check
lands, where it should say `CompanyGraph: checking`; one line fixes it and it goes in with the
trial's findings. And the status bar will say `pin differs`, because the instance's manifest
names the checker release before the one this build bundles; that is the report working, and
moving the instance's pin is an editorial change of its own.

## Validation

1. The pane reads "The mechanical checks pass" and ends with the writing-rules line.
2. In `model/roles/writer.md`, change `source: Local` to `source: Nowhere`. How long after the
   last keystroke do the failure, the mark and the count appear? A change event follows
   Obsidian's own save, so expect seconds, not the plugin's pause alone. The pane should list the
   file with two entries, since two checks report one unresolved reference.
3. Keep typing above the marked line while it is marked. Does the mark stay on its line?
4. Hover the marked line: is the message the tooltip? Is the tint visible in the light and in
   the dark theme?
5. Click the pane's entry from another file. Does the file open in the main area, on the right
   line, with the cursor there? And when the file is already open?
6. Open a failing file in a new tab after the check ran: are its marks there at once? Open one
   in a background tab without focusing it, then click the tab: do marks appear?
7. Switch a marked file to Reading view and back. Nothing should throw; the marks return.
8. Undo the edit. Failure, mark and count go.

## Completion, in Source mode

9. On a new frontmatter line type `so`: `source-id` is offered and `source` is not. Do Enter
   and Tab accept?
10. After accepting a key, does the value popup open by itself? After `source: `, sources are
    offered and no skill is. After accepting a value, does the popup stay closed?
11. Under `roles:` on a `  - ` line, roles are offered. On an empty `  - ` line, does Enter end
    the list, or does the popup capture it and insert the first name?
12. In `model/profiles/robert-blust/robert-blust.md`, add a row to `## Skills`: the first cell
    offers skills, the second levels, the third nothing. Type `| Ja` as the last row and check
    the failure lands on that row.
13. On a new line type `## `: the sections the file lacks, required first.
14. Put the cursor in the middle of an existing name and type: nothing should be offered.
15. While `source: Nowh` is half typed and the instance does not parse, names are still offered.

## The new-note flow

16. Create `Untitled.md` in `model/skills/`. The popup for skills elsewhere must show no blank
    row. Rename it to a name with a space: the failure should sit under that file, not under
    "The instance".
17. In the new note type `---` and a field before the closing fence exists: no keys are offered
    until the block is closed. Note how that feels.

## The guards

18. Rename `.companygraph/manifest.json` away and run `CompanyGraph: Check the instance now`: the
    pane says the vault is not an instance and names the command. Rename it back and run it again.
19. Set `core.version` in the manifest to `99.0.0` and run the command: the pane refuses and
    names both releases. Restore the file with `git checkout`.

## Live Preview

20. Repeat 9 to 13 in Live Preview with Settings → Editor → Properties in document set to
    Visible, then to Source. What completes, what does not? Inside a table cell, does anything
    open?
21. Edit `roles` in the Properties widget: is the list written back as a block sequence, one
    entry per line?

## Lifecycle

22. Disable and enable the plugin: marks and status bar go and come back, the pane survives.
23. If a phone is at hand: does the plugin load at all? `addStatusBarItem` is documented as
    not available on mobile.
