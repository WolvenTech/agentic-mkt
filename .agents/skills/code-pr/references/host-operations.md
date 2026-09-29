# Host operations

The nine steps below are the only git-host actions any ship skill performs.
Read `gitHost` from `.wolven-harness.json` (`gh` = GitHub, `bit` = Bitbucket
Cloud) and use the matching half of the table. For each operation, try the
MCP tool for that host first; if the MCP tool is absent or the call fails,
fall back to the `gh` command or the Bitbucket REST route in the same row
without asking. Never merge, enable auto-merge, or read merge settings —
merging is never a step here.

Take credentials only from an already-connected MCP session, or from an
environment variable named below — never from a value typed into a prompt,
and never write a credential to the repo. GitHub: the MCP session, or
`GH_TOKEN` (the `gh` CLI also honors its own logged-in `gh auth` session).
Bitbucket: the MCP session, or the pair `BITBUCKET_EMAIL` and
`BITBUCKET_API_TOKEN` for the REST fallback. Bitbucket REST routes below are relative to `https://api.bitbucket.org`, sent with HTTP basic auth from that pair.

| Operation | GitHub MCP | gh fallback | GitHub doc | Rovo MCP (Bitbucket) | Bitbucket REST | Bitbucket doc |
|---|---|---|---|---|---|---|
| push branch | none — no MCP tool pushes a local branch to either host | `git push` (plain git, not GitHub-specific) | https://github.com/github/github-mcp-server | none — no MCP tool pushes a local branch to either host | `git push` (plain git, not Bitbucket-specific) | https://support.atlassian.com/bitbucket-cloud/docs/interacting-with-bitbucket-via-mcp/ |
| open PR | `create_pull_request` | `gh pr create` | https://cli.github.com/manual/ | `createPullRequest` | `POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests` | https://support.atlassian.com/bitbucket-cloud/docs/interacting-with-bitbucket-via-mcp/ |
| read PR and diff | `pull_request_read` (`method: get`, `method: get_diff`) | `gh pr view`, `gh pr diff` | https://github.com/github/github-mcp-server | `getPullRequestDetails` (no separate diff method) | `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}` and `.../pullrequests/{pull_request_id}/diff` | https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/ |
| list unresolved threads | `pull_request_read` (`method: get_review_comments`) | `gh api graphql` (query `reviewThreads`, filter on `isResolved: false`) | https://cli.github.com/manual/gh_api | none — no tool filters by resolution state; `getPullRequestComments` returns comments only | `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments` (entries with no `resolution` field) | https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/ |
| reply to a thread | `add_reply_to_pull_request_comment` | `gh api repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies` | https://cli.github.com/manual/gh_api | `addPullRequestComment` | `POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments` (body sets `parent.id` to the comment being answered) | https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/ |
| resolve a thread | `pull_request_review_write` (`method: resolve_thread`) | `gh api graphql` (`resolveReviewThread` mutation) | https://cli.github.com/manual/gh_api | none — no tool marks a comment resolved | `POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}/resolve` | https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/ |
| post a review comment | `add_comment_to_pending_review`, then `pull_request_review_write` (`method: submit`) | `gh pr review --comment -b "..."` | https://cli.github.com/manual/ | `addPullRequestComment` | `POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments` | https://support.atlassian.com/bitbucket-cloud/docs/interacting-with-bitbucket-via-mcp/ |
| read check status | `pull_request_read` (`method: get_check_runs`) | `gh pr checks` | https://cli.github.com/manual/gh_pr_checks | `analyzePullRequestCommitStatusFailures` (surfaces failures, not a plain pass/fail read) | `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/statuses` | https://developer.atlassian.com/cloud/bitbucket/rest/api-group-commit-statuses/ |
| read a failing log | `get_job_logs` (`failed_only: true`) | `gh run view --log-failed` | https://cli.github.com/manual/gh_run_view | none — `analyzePipelineStepFailure` diagnoses a failure but returns no raw log text | `GET /2.0/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/log` | https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pipelines/ |
