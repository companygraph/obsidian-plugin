# Every UI feature has a test — part two

> **For agentic workers:** this part was written and run in one session, test file by test file, against the harness of part one. It is a record of what each file holds and what writing it found, not a plan to execute. Part one is `2026-09-20-run-in-obsidian.md`; the spec is `docs/superpowers/specs/2026-09-20-run-in-obsidian-design.md`, §6.

**Goal:** every feature of the plugin a person can see or use in Obsidian has a test under `e2e/` that works it as that person would.

**How it was written:** the features were read from the code, not remembered: the commands `main.ts` registers, the modals and panes each opens and the words they show, the marks and what a click on them does. After each group `npm run e2e:coverage` was read for functions never entered, which is how the next group was chosen.

## What each file holds

`e2e/ui.ts` is what the command tests share: a command run by its id, a notice waited for, a prompt's items and a pick from them, a modal's title, its fields and its buttons, the file in front, a file as it is on disk, and the checks having run.

`e2e/entities.e2e.ts`: New entity through its two prompts, for a type of the model's own and for one the note in front owns, which asks its start and leads the filename with the year; its refusals, no name and a name the type already has, each leaving the modal open; Rename entity reviewing what it will change, then carrying the file, the H1 and every reference, with the checks clean after; Delete entity naming what names it, keeping the file on Cancel, and on Delete leaving the checks to name what no longer resolves.

`e2e/compliance.e2e.ts`: a clean instance says it complies in the pane and in the status bar, and the report is copied; a failure made in a cell is listed under its file with its line, tints its row, says why under the pointer, and opens the cell its message names; a failure made in the frontmatter opens the note on the Properties row of its field.

`e2e/page.e2e.ts`: Add a section offers exactly what the schema still allows and writes the one picked, and an optional section's mark removes it again; Remove section takes an optional section out and refuses a required one; a declared heading cannot be typed into and says so, and the H1 can; a required section that is missing is a line to click, and the click writes it; Add a field offers exactly what the schema still allows, writes the key and gives its Properties row the focus; the writing brief follows the cursor from one section to another.

`e2e/names.e2e.ts`: a click into an empty cell offers the names its column declares and writes the one chosen; what is typed narrows the list, and Complete here brings it back; in Source mode a value is completed from the names its field declares; Cmd+click opens the entity a name names, in a drawn cell, on a Properties pill and in Source mode.

`e2e/settings.e2e.ts`: Obsidian's four panes are off in an instance, come back with the setting off, go off with it on, and stay off across a reload, watched and not read once; References in document draws the two lists under the note and a mention there opens as the pane's would; a name the note itself writes opens the entity it names.

`e2e/form.e2e.ts` gained the form's own command, which says so of a note already in the form and writes one that is not, and the write that comes when a note is left.

`e2e/commands.e2e.ts` reads the commands from the running plugin and the suite's own files for the ones a test runs, and fails for a command no test runs. It was seen to fail with one test file left out.

## What writing it found

No defect of the plugin's beyond the one part one found. Every failure on the way was the suite's own, and each is a rule now.

A chord of the application menu is not a key. On macOS Cmd+A in a plain text field is the menu's, and a bare key event never reaches it: a name typed into Rename entity's field landed in the middle of the old one. `press` sends the protocol's editing command beside the key. CodeMirror handles its own chords and never needed it.

A condition is read for its truth, and an empty list is true. `never` failed at once on a condition that answered `[]` for "no pane is on". A condition that collects what went wrong answers null where nothing did.

What is asserted is waited for. The rename's notice comes before the profile's file holds the new name; reading the file at once failed, waiting for it to name the skill did not.

`restore` asks until it holds. An editor with an edit of its own in hand merges what is written under it and saves the merge a moment later, which left a note with a section twice; a Properties row being typed into writes the frontmatter back.

Obsidian's own timing is not what is held. When Obsidian writes which of its own plugins are on is its business; waiting on it ran out now and then under coverage, so before the reload the test asks Obsidian to write and then reads the file.

Obsidian's settings are a window of their own, which the driver's mouse does not reach. The one switch the suite flips there is pressed through its element, the only click in the suite that is not a real one, and the move to WebdriverIO, which can change windows, is where that ends.

A reload loses what ran before it. Coverage is now taken before every reload a test asks for, since the evaluation before it is not always still there at the end; the settings tab's own drawing had counted as never run.

An entity is chosen from the plugin's own list, never as the first file under a folder. Obsidian lists files in no order a test can lean on, and a folder of entities can hold a README, which is no entity: one run in ten drew no references under a note that had none to draw. And the checks being clean says nothing of whether the plugin has read the vault again, since they were clean before as well: after a rename the delete waits for the plugin to know the entity under its new path. The first ten runs of the whole suite were six green; these two were the four red ones. Choosing in a stable order then made a third one plain, which the unstable order had hidden nine runs in ten: the first experience of the fixture lists no skills and has no pill to click, so a test says what the entity it needs has to hold.

`innerText` is what is drawn, not what is written: the brief's type is drawn in capitals by a style. Where the written text is meant, `textContent` is read.

## What is not held, and why

The item Obsidian's own menu loses, Add file property, is not tested: on macOS a menu is native and never becomes elements the page can read. The quit path of the form is not tested, since ending the application ends the test. A phone, a popped-out window and a second vault are not tried. What only a person can judge is still tried by hand.
