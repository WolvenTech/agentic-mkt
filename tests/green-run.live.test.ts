import { describe, expect, it } from "vitest";
import { buildEvidence, runPreflight } from "../src/clickup/green-run-validation.js";
import { loadRepoDotenv } from "../src/load-env.js";

function liveCredentials():
  | { token: string; listId: string; n8nApiUrl: string; n8nApiKey: string }
  | undefined {
  const probe: NodeJS.ProcessEnv = { ...process.env };
  loadRepoDotenv(undefined, probe);
  const token = (probe.CLICKUP_API_TOKEN ?? probe.CLICKUP_TOKEN ?? "").trim();
  const listId = (probe.CLICKUP_LIST_ID ?? "").trim();
  const n8nApiKey = (probe.N8N_API_KEY ?? "").trim();
  const n8nApiUrl = (probe.N8N_API_URL ?? "https://n8n.wolven.com.br").trim();
  return token && n8nApiKey ? { token, listId, n8nApiUrl, n8nApiKey } : undefined;
}

const credentials = liveCredentials();

describe.skipIf(!credentials)("green-run preflight — live (requires CLICKUP_API_TOKEN, N8N_API_KEY; run pnpm vendor:gate first)", () => {
  it("runs the preflight checklist against ClickUp + n8n and returns a buildable evidence document", async () => {
    const { token, listId, n8nApiUrl, n8nApiKey } = credentials!;
    const report = await runPreflight({
      clickupToken: token,
      clickupListId: listId,
      n8nApiUrl,
      n8nApiKey,
    });

    expect(report.results.length).toBeGreaterThanOrEqual(7);
    const stepNames = report.results.map((r) => r.step);
    expect(stepNames).toContain("field_mapping_synced");
    expect(stepNames).toContain("n8n_call_agent_workflow_present");
    expect(stepNames).toContain("n8n_main_workflow_present");

    const evidence = buildEvidence(report);
    expect(["blocked", "ready", "passed"]).toContain(evidence.validation_status);
  });
});
