# Conventional Commit examples (code-commit)

Why-focused subjects. Bodies are optional — use one when the context helps a
reviewer.

## Good

### States the outcome (why-focused)

```text
fix(billing): stop double invoice retries on webhook replay

The webhook handler re-queued a retry every time the payment provider
resent an already-processed event. Retries are now keyed by the
provider's idempotency id, so a replay is a no-op.
```

**Why good:** scope + outcome; the body says what changed and why, not which
process ran.

### Small, scoped fix

```text
fix(export): reject a CSV row with a missing currency code
```

**Why good:** `type(scope)` matches the change; the subject is the
behavioral fix itself.

### Docs-only

```text
docs(specs): add a retry policy to the avatar-upload spec
```

**Why good:** `docs` type; the subject names the concrete doc change.

### Multi-commit split (standalone)

Commit 1:

```text
chore(ci): add a lint job for the billing service
```

Commit 2:

```text
feat(billing): add refund reason codes to invoice export
```

**Why good:** unrelated contexts — pipeline config vs a feature — not
squashed into one message.

### Atomic plan completion (after a wave gate)

One commit stages **both** the proven work and **only** that unit's plan
Done-when / completion mark (`docs/specs/<slug>/<slug>-plan.md`).

```text
feat(avatar-upload): stream large uploads instead of buffering in memory

Uploads over 10MB were buffered fully before validation, which spiked
memory under concurrent uploads. The handler now validates and writes in a
stream, one chunk at a time.
```

Staged together (illustrative):

```text
src/avatar/upload-handler.ts
test/avatar-upload-handler.test.ts
docs/specs/avatar-upload/avatar-upload-plan.md   # only this unit's row [ ] -> [x]
```

**Why good:** the work and its matching plan-completion mark share one
commit; the message says what the handler now does, not that a gate ran. No
other unit's checkbox moves.

## Type quick reference

| Type | Use when |
|------|----------|
| `feat` | New capability or user-visible behavior |
| `fix` | Bug or gate correction |
| `docs` | Documentation/spec only |
| `chore` | Build, tooling, deps — no feature |
| `refactor` | Structure change, same behavior |
| `test` | Tests only |
| `ci` | CI workflow changes |

## HEREDOC (required shape)

```bash
git commit -m "$(cat <<'EOF'
fix(billing): stop double invoice retries on webhook replay

The webhook handler re-queued a retry every time the payment provider
resent an already-processed event. Retries are now keyed by the
provider's idempotency id, so a replay is a no-op.
EOF
)"
```

## Bad examples — what not to do

Everything below is an anti-pattern. Do not copy these — each one exists
only to contrast with a good example above.

### States which process ran (bad)

Same diff as the first good example above, written the ceremony way instead:

```text
fix(billing): complete invoice-retry cleanup task

Ran the checklist and closed out the retry item; validation confirmed.
```

**Why bad:** the subject and body describe the *process that ran* —
checklist, item, validation confirmed — not the actual change. A reader
still doesn't know what the retry bug was or how it's fixed now. Compare to
the real fix above.

### File-dump subject

```text
update invoice export handler and tests and plan
```

**Why bad:** not Conventional Commits; no type; restates the diff.

### Vague feat

```text
feat: improvements
```

**Why bad:** no scope; no why; unreviewable.

### Wrong type

```text
feat(docs): fix typo in the README
```

**Why bad:** a typo fix is `fix` or `docs`, not `feat`.

### Secrets (refuse)

```text
chore: add .env for local testing
```

**Why bad:** never commit secrets — refuse and warn instead.

### Split plan completion from unit work (refuse / fix)

Commit 1 — work only:

```text
feat(billing): add idempotency keys to invoice retries
```

Commit 2 — plan checkbox landed later:

```text
docs(specs): mark the invoice-retry unit complete
```

**Why bad:** violates the same-commit rule. The plan-completion mark must
land in the **same** commit as the proven work, and only for that unit.

### Failed commit leaves false green (cleanup required)

**Bad outcome:** `git commit` fails (hook reject, empty stage, abort) but
`docs/specs/avatar-upload/avatar-upload-plan.md` still shows the unit as
`[x]` / complete in the worktree.

**Cleanup (required before retry or claim):**

1. Leave the unit **incomplete** — do not claim it done.
2. Reverse the plan-completion edit (restore `[ ]` / incomplete), or leave
   it explicitly incomplete — never keep a false-green checkbox.
3. Unstage or discard only the failed attempt's false-completion mark; keep
   any other real, still-valid uncommitted work.
4. Re-confirm validation passes, then retry one atomic commit (work plus
   the matching plan-completion mark only).

**Why bad without cleanup:** the atomic plan-completion gate fails — a
failed commit must leave the item incomplete with no false-green plan mark.
