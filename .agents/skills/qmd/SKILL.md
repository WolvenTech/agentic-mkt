---
name: qmd
description: Search local markdown knowledge bases, notes, docs, and wikis with QMD. Use when users ask to find notes, retrieve documents, inspect a wiki, answer from indexed markdown, or set up QMD access.
license: MIT
compatibility: Requires qmd CLI or MCP server. Install via `npm install -g @tobilu/qmd`.
metadata:
  author: tobi
  version: "2.2.0"
allowed-tools: Bash(qmd:*), mcp__qmd__*
---

# QMD - Query Markdown Documents

## How search works

QMD searches local markdown collections: architecture decisions, product
requirement docs, specs, notes, and deferrals. Use it before web search
when the answer may already be in indexed local files.

The workflow is always: search for candidates, retrieve the full text with
`qmd get`/`qmd multi-get`, then answer from retrieved text, citing paths or
docids. Do not answer from snippets alone when the user needs facts,
decisions, quotes, or nuance — snippets are only leads.

**Search ADRs first, then widen.** Architecture decision records are the
record you may depend on — search `-c adrs` first and widen only on a miss:

```bash
qmd query -c adrs "<question>"    # 1. the decisions you may depend on
qmd query "<question>"            # 2. widen across all collections on a miss
```

Typical loop:

```bash
qmd search "retry policy for outbound calls" -n 5
# leads: #abc123 adrs/adr-NNN-retry-policy.md; #def432 specs/outbound-calls/outbound-calls-spec.md
qmd multi-get "#abc123,#def432" --format md
```

**Default to structured `qmd query` with `intent:`, `lex:`, `vec:`, and
`hyde:` fields that you write yourself.** You are a better query expander
than the built-in model: you know the actual goal, the domain vocabulary, and
the nearby-but-wrong ideas to avoid. Do not just paste the user's words into
`qmd query "..."` and hope the expansion model guesses right.

```bash
qmd query $'intent: Find the ADR that fixed the retry policy, not the general HTTP client setup.\nlex: retry backoff outbound calls policy\nvec: how many retries before giving up\nhyde: An ADR records the retry policy: exponential backoff, capped attempts, a dead-letter path.'
```

- `intent:` what you are trying to find **and what to avoid**.
- `lex:` exact terms, aliases, titles, rare words you expect.
- `vec:` paraphrases the idea in natural language.
- `hyde:` describes the document or answer that would satisfy the request.

Write at least `intent:` plus one of `lex:`/`vec:`. If you have nothing to
expand (a single rare token, a verbatim phrase), use `qmd search` instead.

## Retrieve documents

Search results include docids like `#abc123` and `qmd://...` paths:

```bash
qmd get "#abc123"
qmd get qmd://specs/outbound-calls.md
qmd multi-get "#abc123,#def432" --format md    # add --format json to parse
```

`get`/`multi-get` are line-numbered by default and print the `#docid` and
`qmd://` path — cite both. Pass `--no-line-numbers` for raw content to copy
verbatim, or `--full-path` to hand a path to `Read`/`Edit`.

### Read line ranges with `:from:count` — do not shell out to `sed`/`head`/`tail`

```bash
qmd get "#abc123:120:40"                 # 40 lines starting at line 120
qmd get "#abc123" --from 120 -l 40        # equivalent, using flags
```

Piping through `sed`/`head`/`tail` defeats docid resolution and line numbering.

## Discover what is indexed

```bash
qmd collection list
qmd ls
qmd status
```

Add collection filters when a broad search drifts into the wrong material:

```bash
qmd search "outbound retry policy" -c adrs -n 10
qmd query "deferred scope on the retry work" -c deferrals -c specs -n 10
```

Omit `-c` to search everything. Collections in this repo: `adrs`, `prds`,
`specs`, `notes`, `deferrals`.

## MCP Tool: `query`

Prefer structured searches over the MCP server too:

```json
{
  "searches": [
    { "type": "lex", "query": "outbound retry policy backoff" },
    { "type": "vec", "query": "how many retries before giving up" }
  ],
  "intent": "Find the ADR that fixed the retry policy.",
  "collections": ["adrs"],
  "limit": 10
}
```

Query types: `lex` (BM25 keyword search), `vec` (vector semantic search),
`hyde` (vector search using a hypothetical answer passage).

## Setup and maintenance

Only mutate indexes when asked for setup or maintenance — searching and
retrieving are safe, but index mutation is not a casual first step:

```bash
npm install -g @tobilu/qmd
qmd collection add docs --name adrs
qmd update
qmd embed
```

Health and diagnostics: `qmd doctor`, `qmd status`, `qmd pull`.

## Pitfalls

- **Do not stop at snippets.** Fetch documents before making claims.
- **Do not slice files with `sed`/`head`/`tail`.** Use `path:from:count` or `--from`/`-l`.
- **Do not lean on query expansion.** Write `intent:`/`lex:`/`vec:`/`hyde:` yourself.
- **Do not overuse semantic search.** If you know exact titles or terms, BM25 is faster.
- **Do not mutate indexes casually.** `qmd collection add`/`update`/`embed` change local state.
- **Model-backed commands can be environment-sensitive.** Fall back to `qmd search` with stronger lexical terms if a query or reranking step fails.
- **Ambiguous wording needs `intent:`.** Add it rather than hoping query expansion guesses right.
