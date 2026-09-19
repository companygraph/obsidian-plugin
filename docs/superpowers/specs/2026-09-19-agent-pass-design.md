# The agent pass, from the pane — design

> The writing rules are the half of a schema no check reads. The plugin hands them to the agent the
> instance already has, Claude Code first, in the background and read-only, and shows what it
> judges in the pane and on the line, apart from the mechanical failures and never counted with
> them.

Status: designed with the owner on September 19, 2026, and built as planned in
`docs/superpowers/plans/2026-09-19-agent-pass.md`; not yet tried in Obsidian. It details the paragraph of
the plugin's design, `2026-09-18-obsidian-plugin-design.md` §8, headed "The agent pass, from the
pane"; where the two differ, this one is the later decision. The plugin still calls no model
itself: it starts the agent program the instance is already worked with, and reads its answer.

## What is judged

The instance's `companygraph-validate` skill is the R0 agent pass. Its steps 1 to 7 are the
mechanical rules, which the plugin already runs on every change through the meta-model's checks.
Its step 8 is what nothing mechanical reaches: each entity judged against its schema's
`## Writing rules`, one rule at a time; the gap lines a human profile's roles produce; and the
lines only reading can judge, whether an Evidence row's `What it shows` is a concrete fact,
whether `## In practice` says what following and breaking a value looks like. That step, and no
other, is what the pass runs. The skill and the schemas stay the authority: the plugin names the
step and the files, and says nothing of what the rules are.

## Decisions

The owner settled these, each against the alternatives named.

- **In the background.** The plugin starts the agent headless in the vault and shows the result
  in the pane. Not a terminal with an interactive session, whose result would never reach the
  pane or the marks; continuing a judgment in a terminal is left for later.
- **Two scopes.** `CompanyGraph: Judge this note` judges the note in front, quick and cheap and
  meant for writing. `CompanyGraph: Judge the instance` judges every entity, minutes long and
  meant for before a commit. The pane keeps both kinds of result.
- **Kept in the plugin's data, marked stale.** Judgments are saved in the plugin's own data in
  `.obsidian/`, never in the instance and never committed, per note with a hash of the text
  judged. When the note has changed since, its judgments stay visible, greyed and labelled
  "judged an earlier version", until the next run. They survive a restart.
- **The pane and a quiet mark.** The pane lists judgments under their own heading, "Writing
  rules, judged by Claude Code", below the failures and never in their count. The judged line
  carries a quiet amber mark with the judgment as its tooltip, distinct from a failure's red
  tint. The status bar adds a second count.
- **The agent's own skill, answered in a declared shape.** Of three ways considered, the plugin
  asks Claude Code to run step 8 of the instance's skill and to answer in a JSON Schema it passes
  along. Rejected: calling a model's API from the plugin, which would need a key in Obsidian and
  break the rule that the plugin calls no model; and parsing the skill's prose report, which would
  break at its first rewording.

## How a run goes

**The command line.** Read from the installed Claude Code, 2.1.207:

```
claude -p <prompt> --output-format json --json-schema <schema>
       --allowedTools Read Grep Glob --no-session-persistence [--model <model>]
```

It runs in the vault's root, which is the instance's. `--allowedTools` leaves the agent able to
read and nothing else; in print mode a tool not allowed is denied, and a denial is reported in the
answer's `permission_denials`, which the pane says. `--no-session-persistence` keeps a run out of
the owner's session list. A probe of this form answered with an object carrying `structured_output`
in the declared shape, `is_error`, `subtype`, `num_turns` and `total_cost_usd`.

**The prompt** is written by a pure module and says four things: run step 8 of the
`companygraph-validate` skill and no other step; on these files, the note's path or every entity;
cite each rule in the schema's own words and each place by its path and its line, counted from one
as the file has it; and report a breach, not a rule kept.

**The shape** asked for:

```
{
  "judgments": [{ "path", "line", "type", "rule", "judgment" }],
  "gaps":      [{ "profile", "role", "skill" }],
  "notJudged": [ "what the pass did not reach, in words" ]
}
```

A judgment is a writing rule broken on a line; `rule` is the rule's words, `judgment` one or two
sentences on why. A gap is the skill's report line, never a failure. `notJudged` is the skill's own
closing, so a clean answer is not read as more than it is.

**Finding the program.** Obsidian started from the Dock does not inherit the shell's `PATH`, so a
bare `claude` is not found there. A settings tab holds the program's path. Empty, the plugin tries
the places Claude Code installs to, `~/.local/bin/claude`, `/opt/homebrew/bin/claude` and
`/usr/local/bin/claude`, and says which it found. The same tab holds an optional model.

**While it runs.** The pane shows the run at the top: what is being judged, for how long, and a
Cancel button, which ends the process. A note run gives up after three minutes, an instance run
after twenty. One run at a time: a second command while one runs says so and starts nothing.

**When it ends.** The answer is read by a pure module against the shape. A judgment whose line is
past its file's end is kept on the file's first line and said to be placed loosely; one whose path
is no entity of the vault is kept under "The instance", with its path in its words, and opens
nothing; an answer that does not match the shape is shown
as "the agent's answer could not be read", with the first lines of what came, and nothing is
stored. A run that exits non-zero, reports `is_error`, times out or is cancelled stores nothing and
says which, and the judgments from before stay. The pane closes a run with its duration and cost.

## Where judgments go

**Stored.** In the plugin's data, per note path: the hash of the text judged, when, by which
program and model, and the judgments and gaps. A note run replaces its note's entry; an instance
run replaces every entry. Renaming a note in the vault moves its entry; deleting it drops it.

**Stale.** A note whose text no longer has the stored hash shows its judgments greyed, labelled
"judged an earlier version", and gives them no mark in the editor, since their lines may have
moved.

**Shown.**
- In the pane, below the failures and the not-checked list: "Writing rules, judged by Claude Code",
  grouped by file like the failures, each entry with its line, the rule it cites and the judgment,
  opening its place on a click as a failure does. Then the gaps, then what the agent did not judge,
  then the last run's time, duration and cost.
- In the editor, the judged line of a note that is not stale carries an amber mark, apart from a
  failure's red, with the rule and the judgment as its tooltip.
- In the status bar, a second count beside the failures, `2 judged`, grey when stale.

## Units

- `src/agent.ts`, pure: the prompt for a scope, the JSON Schema, and the reading of an answer into
  judgments, gaps and what was not judged, or into the reason it could not be read.
- `src/judgments.ts`, pure: the store's shape, replacing entries per run, moving and dropping on a
  rename or delete, and whether an entry is stale for a text.
- `src/runner.ts`: finding the program, starting it with the command line above, the timeout and
  the cancel. Desktop only; on a phone the two commands are not offered.
- The pane, the marks and the status bar gain the display; a settings tab holds the path and the
  model.

## Testing

The pure modules against fixtures: prompts for both scopes, answers in the shape and out of it,
paths outside the vault and lines past the end, staleness by hash, a rename and a delete. The
runner against a stand-in program, a small Node script in `test/` that prints a canned answer,
sleeps past the timeout or exits non-zero, so starting, timing out and cancelling are tested
without a model or its cost. One run against Claude Code itself is the trial, by hand.

## What it does not do

- It never runs on a change: a run takes a minute or more and costs money, so only a command
  starts one.
- It never writes: not a note, and not the instance's files.
- It is not a check. A judgment is shown as a judgment, never counted with the failures, and the
  closing line of the pane still says the writing rules are a judgment no check reads.
- Codex and Gemini's command-line agents are later. `runner.ts` takes a program and its arguments
  from one place, so a second agent is a second way of writing the command line and reading its
  answer, not a second design.
