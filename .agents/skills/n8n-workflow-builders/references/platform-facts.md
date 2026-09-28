# n8n platform facts

Runtime rules distilled from two upstream skills and checked against this
repo on 2026-09-28. Each fact names its source; re-check the source before
relying on a fact that has started to matter.

| Key | Source | License |
| --- | --- | --- |
| [CZ] | [`czlonkowski/n8n-skills`](https://github.com/czlonkowski/n8n-skills), `skills/n8n-code-javascript/SKILL.md` | MIT |
| [N8N] | [`n8n-io/skills`](https://github.com/n8n-io/skills), `skills/n8n-code-nodes-official/SKILL.md` | Apache-2.0 |

## Code node or expression

- Decision order: expression (`{{ … }}`) → arrow function inside an Edit
  Fields value → Code node. A Code node earns its place for multi-source
  aggregation, stateful logic, or libraries. [N8N]
- Code runs in a sandboxed runtime; expressions and Edit Fields run
  in-process, so per-invocation overhead is far higher in Code. Matters on
  hot paths and large item counts. [N8N]
- Two small transforms are better as two nodes than one Code block. [N8N]

In this repo, logic that must be unit-tested against
`src/**/logic.ts` stays a Code node source so the equivalence suite can run
it; that is a legitimate reason to choose Code.

## Code node contract

- Prefer "Run Once for All Items" mode; read with `$input.all()`,
  `$input.first()`, or `$input.item`. [CZ]
- Return `[{ json: { … } }]`. Returning a primitive or `null` fails. [CZ]
- Webhook payloads arrive under `$json.body`, not at `$json` directly. [CZ]
  `extract-webhook-context.js` accepts both shapes, which keeps local
  equivalence tests and live deliveries on one code path.
- `this.helpers.httpRequest()` exists without auth; the bare `$helpers`
  global is undefined in the task-runner sandbox, and
  `httpRequestWithAuthentication` is deny-listed. For auth, pagination, or
  retries, use an HTTP Request node and keep Code for pure logic. [CZ]
- `$env` is unavailable when `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`;
  `require()` works only for modules the instance allowlists. [CZ]

## Where this repo already follows these

- No Code node source calls `this.helpers`, `$env`, or `require()`; ClickUp
  and OpenAI calls go through ClickUp, HTTP Request, and OpenAI nodes.
- `retryOnFail` is set on the three ClickUp comment POSTs (task, blocker,
  pointer) and the two GitHub fetches in Call Agent; the Doc and page
  requests do not retry.
- The only workflow state is `$getWorkflowStaticData('global')` for the
  best-effort dedup (ADR-010).
