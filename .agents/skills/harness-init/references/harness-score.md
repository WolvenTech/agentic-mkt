# Harness Score

Covers how step 6 scores the harness before the validate-wiring question.
`harness:score` runs [harness-score](https://github.com/paladini/harness-score),
which rates the repo's agent harness from its files alone: a maturity level
from L0 to L4 and a list of failing checks. The tool is always installed. The
repo chooses how deep its harness goes by dropping checks in
`.harness-score.json`, never by skipping the tool.

## Run it

This reference was written against harness-score 1.6.5, the version `setup`
pins. Check IDs and presets below come from that release.

Run `harness:score` and read the whole report. When it cannot run because
`harness-score` is not installed, run `pnpm exec wolven-harness setup` again:
it creates only missing paths and prints the pinned install command. Show the
Human that command, and score only after their yes and the install. A repo
with no `package.json` has no `harness:score` script; use the
`pnpm dlx harness-score@<version>` command `setup` prints instead.

Record the level and score in the note as the "before" figure.

## One question per dimension

Group the failing checks by the dimension the report lists them under. For
each dimension with a failing check, ask one question, listing the check IDs
and what each one wants:

1. **Keep as gaps.** The checks stay failing and go into the note's next steps
   as work to build later. Recommended when the repo already has part of that
   dimension, such as tests without a linter.
2. **Drop them.** Add `"<check-id>": "off"` for each one under `rules` in
   `.harness-score.json`. For the whole hooks dimension, add `"no-hooks"` to
   `extends` instead. Recommended when the repo will not build that dimension,
   such as hooks in a repo whose agents run without them.
3. **Split.** The Human names which checks to drop and which to keep.

Never build a failing check inside this run. Building one is a change of its
own, with its own spec.

`HYG-03`, `HYG-04` and `HYG-06` detect leaked credentials and can never be
dropped. A failure there is not a question: stop and show the Human the
finding before going on.

## Write and re-score

Nothing is written without a yes: show the `.harness-score.json` diff, wait
for the Human's yes, then write. Run `harness:score` again and record the level
and score as the "after" figure, with every dropped check and the reason the
Human gave.

The score is a report here. Whether CI fails below a level
(`harness-score --min-level <n>`) is the Human's call, made separately from the
validate-wiring question.
