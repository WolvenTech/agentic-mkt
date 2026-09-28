---
name: handoff
description: Save a handoff document to the OS temp directory so a fresh session can pick up the work — ask-only, never invoked automatically
disable-model-invocation: true
---

# Handoff

Saves a handoff document summarising the current session so a fresh session
— same runtime or a different one — can continue the work. Ask-only:
nothing else in this package invokes it; it runs only on a direct ask.

**Template:** [references/TEMPLATE.md](references/TEMPLATE.md)

## Save location

Save to the OS temp directory — `$TMPDIR` (or `/tmp`) on macOS/Linux,
`%TEMP%` on Windows — **never inside the repository**. Name the file with
today's date and a short slug, e.g. `2026-09-25-handoff-payment-retry.md`.
Print the saved path once written, and say plainly that the file must not be
committed to the repository.

## Ceremony

1. **Next-session goal** — one sentence: what the next session should
   accomplish.
2. **Context** — short bullets: decisions made, current state, what is
   blocked. Do not re-narrate a spec or plan already on disk.
3. **Artifacts** — paths, branch name, commit SHAs, pull request links. Cite
   the location; never paste a file's body into the handoff document.
4. **Open decisions** — choices still unset, with a recommended default when
   there is one.
5. **Suggested skills** — name, in backticks, which skills the next session
   should invoke and why. Name only skills that exist in this package.
6. **Cross-runtime notes** — one short subsection each for how to load the
   file in Claude Code, Codex, and Cursor.
7. **Redaction** — strip secrets, tokens, credentials, and personal data
   before saving; state what (if anything) was removed.

## Hard gates

1. **Ask-only** — `disable-model-invocation: true` plus `agents/openai.yaml`
   setting `allow_implicit_invocation: false`; never invoked by another
   skill or automatically.
2. **Temp directory only** — never write the handoff file inside the
   repository workspace, and say so in the document itself.
3. **Cite, don't paste** — artifacts are paths, branch names, commit SHAs,
   and links; never a pasted file body.
4. **Redact first** — no secret, token, credential, or personal detail in
   the saved file.
5. **Real routing** — every suggested skill is one this package actually
   ships, named in backticks.

## When not to use

- The current session continues without a runtime, machine, or worktree
  hop — keep working inline instead.
- Everything the next session needs already lives in one artifact — send
  its path instead of writing a second document.

## Anti-patterns

- Saving the handoff file inside the repository workspace
- Pasting a spec, plan, or diff body instead of citing its path
- Missing suggested skills, leaving the next session to guess routing
- Leaving a credential, token, or personal detail in the saved file
- Naming a skill this package does not ship
