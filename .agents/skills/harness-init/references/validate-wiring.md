# Validate wiring

Covers the one setup question step 6 asks before the note's final sections:
how `harness:validate` gets run. It is a single question, asked once, with the
recommended option first.

## Detect first

Read what already exists before asking, and use it to frame the options:

- CI config: `.github/workflows/*.yml`, or `bitbucket-pipelines.yml`. Which one
  applies follows `gitHost` in `.wolven-harness.json` (`gh` is GitHub Actions,
  `bit` is Bitbucket Pipelines); mention any other CI file the repo has.
- `package.json` scripts: an existing `validate` or `test` script, by name and
  current value.

## The question

Ask how `harness:validate` should run, naming the evidence found:

1. **(a) A CI job on pull requests** — recommended when a CI config exists or
   the repo is hosted on a platform that provides one.
2. **(b) Chained into the existing script** — offered when a `validate` or
   `test` script exists; name the script.
3. **(c) Local only** — nothing is added; the Human runs `harness:validate`
   by hand.

List (b) only when there is a script to chain, and put whichever option the
evidence supports best first.

## What each answer does

Nothing is written without a yes: show the diff, wait for the Human's yes, then
write, then run `harness:validate`.

- **(a)** Add a minimal job or step that runs on pull requests. Hosted
  runners have no pnpm and may have an older Node, so the job must set up
  pnpm and Node ≥ 22 before it runs `pnpm install --frozen-lockfile` and then
  `pnpm harness:validate`. When the repo already has a workflow or pipeline,
  reuse its setup steps and extend the file rather than replacing it.
  - GitHub Actions: a new workflow on `pull_request` with `contents: read`
    permissions; `actions/checkout`, `pnpm/action-setup` (the version from
    `packageManager` in `package.json` when it names pnpm), `actions/setup-node`
    with Node ≥ 22 and `cache: pnpm`, then install and validate.
  - Bitbucket Pipelines: a pull-request step in `bitbucket-pipelines.yml` on an
    image with Node ≥ 22, running `corepack enable`, then install and validate.
- **(b)** Append `&& pnpm harness:validate` to the named script's value.
- **(c)** Write nothing; record the choice.

Record the answer under "Validate wiring" in the session note, with what was
written or "nothing written" for (c) or a declined diff.
