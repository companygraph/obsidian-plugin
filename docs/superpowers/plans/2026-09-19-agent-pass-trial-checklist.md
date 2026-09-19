# The agent pass — what to try

The build is in `~/git/robertblust/mental-model/.obsidian/plugins/companygraph/`. Reload Obsidian
with Cmd+P, "Reload app without saving". Nothing here has run inside Obsidian yet, so every step is
a question. Each run starts Claude Code and costs what it costs; the pane says how much when it
ends. Nothing is written to the instance: the judgments live in the plugin's own data.

## A note judged

1. Open Settings → Community plugins → CompanyGraph. The Claude Code field is empty and says the
   places it looks. Leave it empty.
2. Open `model/roles/writer.md` and run `CompanyGraph: Judge this note against its writing rules`.
   Does the pane show the run at the top, with a clock that moves and a Cancel button?
3. When it ends: is there a section "Writing rules, judged by Claude Code" below the failures and
   the folded "Not checked", with an entry per breach, its line, the rule in italics and the
   judgment? Below it the last run's file, time, seconds, cost and program.
4. Do the judged lines carry a quiet amber mark, and does hovering one show the rule and the
   judgment? Does the status bar say `N judged` beside the failures?
5. Are the failures' count and the judged count clearly apart, and is the pane's closing line about
   the writing rules still there?

## Stale, cancelled, refused

6. Type a word into the judged note. Do its judgments grey with "judged an earlier version", do
   the amber marks go, and does the status bar say `(N stale)`?
7. Run the command again and press Cancel within a second or two. Does the pane say the judgment
   was cancelled and nothing stored, and do the earlier judgments stay?
8. Set the Claude Code path in the settings to `/nope/claude` and run it again. Does a notice say
   Claude Code was not found? Put the setting back to empty.
9. Run it on a note that is no entity, such as a README. Is the command missing from the palette?

## Kept

10. Reload Obsidian. Are the judgments still there, still marked stale where they were?
11. Rename a judged note with `CompanyGraph: Rename entity`. Do its judgments follow it?
12. Delete a judged note. Do its judgments go with it?

## The whole instance

13. Run `CompanyGraph: Judge the instance against its writing rules` once, before a commit. It
    takes minutes. Does the pane keep showing the clock and stay usable while it runs?
14. When it ends: are the judgments grouped by file, the gaps folded under "Gaps", what was not
    judged folded under "Not judged", and the cost shown?
15. Is anything of the run left in the instance? `git status` in the vault should show nothing but
    what you edited by hand.
