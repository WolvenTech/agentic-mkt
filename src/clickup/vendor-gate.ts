import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadRepoDotenv, REPO_ROOT } from "../load-env.js";

export const CLICKUP_API = "https://api.clickup.com/api/v2";
export const N8N_API_URL_DEFAULT = "https://n8n.wolven.com.br";

const REQUIRED_CUSTOM_FIELDS = ["Critérios de Aceite", "agent_id", "revision_count"];
const REQUEST_TIMEOUT_MS = 30_000;

export interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GateResult {
  checks: GateCheck[];
  exitCode: 0 | 1 | 2;
}

interface VendorConfig {
  token: string;
  listId: string;
  n8nUrl: string;
  n8nKey: string;
}

type FetchResult = { ok: true; data: any } | { ok: false; message: string };

async function fetchJson(url: string, headers: Record<string, string>): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `connection failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

function clickupRequest(token: string, path: string): Promise<FetchResult> {
  return fetchJson(`${CLICKUP_API}${path}`, { Authorization: token, Accept: "application/json" });
}

function n8nRequest(apiUrl: string, apiKey: string, path: string): Promise<FetchResult> {
  return fetchJson(`${apiUrl.replace(/\/+$/, "")}${path}`, {
    "X-N8N-API-KEY": apiKey,
    Accept: "application/json",
  });
}

function envChecks(env: NodeJS.ProcessEnv): GateCheck[] {
  const token = (env.CLICKUP_API_TOKEN ?? env.CLICKUP_TOKEN ?? "").trim();
  const listId = (env.CLICKUP_LIST_ID ?? "").trim();
  const n8nKey = (env.N8N_API_KEY ?? "").trim();
  const n8nUrl = (env.N8N_API_URL ?? N8N_API_URL_DEFAULT).trim();

  return [
    {
      name: "clickup_token_configured",
      passed: Boolean(token),
      detail: token ? "CLICKUP_API_TOKEN set" : "CLICKUP_API_TOKEN unset",
    },
    {
      name: "clickup_list_id_configured",
      passed: Boolean(listId),
      detail: listId ? `CLICKUP_LIST_ID=${listId}` : "CLICKUP_LIST_ID unset",
    },
    {
      name: "n8n_api_key_configured",
      passed: Boolean(n8nKey),
      detail: n8nKey ? "N8N_API_KEY set" : "N8N_API_KEY unset",
    },
    {
      name: "n8n_api_url_configured",
      passed: Boolean(n8nUrl),
      detail: n8nUrl ? `N8N_API_URL=${n8nUrl}` : "N8N_API_URL unset",
    },
  ];
}

function buildConfig(env: NodeJS.ProcessEnv): VendorConfig {
  return {
    token: (env.CLICKUP_API_TOKEN ?? env.CLICKUP_TOKEN ?? "").trim(),
    listId: (env.CLICKUP_LIST_ID ?? "").trim(),
    n8nKey: (env.N8N_API_KEY ?? "").trim(),
    n8nUrl: (env.N8N_API_URL ?? N8N_API_URL_DEFAULT).trim(),
  };
}

async function liveChecks(config: VendorConfig): Promise<GateCheck[]> {
  const results: GateCheck[] = [];

  const listResult = await clickupRequest(config.token, `/list/${config.listId}`);
  if (listResult.ok) {
    results.push({
      name: "clickup_list_reachable",
      passed: true,
      detail: `List '${config.listId}' -> '${listResult.data?.name ?? "?"}'`,
    });
  } else {
    results.push({ name: "clickup_list_reachable", passed: false, detail: `ClickUp ${listResult.message}` });
  }

  const fieldsResult = await clickupRequest(config.token, `/list/${config.listId}/field`);
  if (fieldsResult.ok) {
    const names = new Set<string>((fieldsResult.data?.fields ?? []).map((f: { name?: string }) => f.name));
    const missing = REQUIRED_CUSTOM_FIELDS.filter((name) => !names.has(name));
    results.push({
      name: "clickup_custom_fields_present",
      passed: missing.length === 0,
      detail: missing.length === 0 ? "Required custom fields present" : `Missing custom fields: ${missing.join(", ")}`,
    });
  } else {
    results.push({
      name: "clickup_custom_fields_present",
      passed: false,
      detail: `Cannot list fields: ${fieldsResult.message}`,
    });
  }

  const workflowsResult = await n8nRequest(config.n8nUrl, config.n8nKey, "/api/v1/workflows?limit=100");
  if (workflowsResult.ok) {
    const workflows: Array<{ name?: string }> = workflowsResult.data?.data ?? [];
    const names = new Set(workflows.map((w) => (w.name ?? "").toLowerCase()));
    const hasCallAgent = names.has("call agent");
    const hasMain = names.has("marketing pipeline");
    results.push({
      name: "n8n_api_reachable",
      passed: true,
      detail: `n8n API OK (${workflows.length} workflows visible)`,
    });
    results.push({
      name: "n8n_call_agent_workflow_present",
      passed: hasCallAgent,
      detail: hasCallAgent ? "Call Agent workflow found" : "Call Agent workflow not imported",
    });
    results.push({
      name: "n8n_main_workflow_present",
      passed: hasMain,
      detail: hasMain ? "Marketing Pipeline workflow found" : "Marketing Pipeline workflow not imported",
    });
  } else {
    const fail = `n8n ${workflowsResult.message}`;
    results.push({ name: "n8n_api_reachable", passed: false, detail: fail });
    results.push({ name: "n8n_call_agent_workflow_present", passed: false, detail: fail });
    results.push({ name: "n8n_main_workflow_present", passed: false, detail: fail });
  }

  return results;
}

/** Run the vendor gate: env checks first, live connectivity checks only when env checks all pass. */
export async function runGate(env: NodeJS.ProcessEnv = process.env): Promise<GateResult> {
  const checks = envChecks(env);
  if (!checks.every((c) => c.passed)) {
    return { checks, exitCode: 1 };
  }

  const live = await liveChecks(buildConfig(env));
  const all = [...checks, ...live];
  return { checks: all, exitCode: all.every((c) => c.passed) ? 0 : 2 };
}

function isStrict(env: NodeJS.ProcessEnv): boolean {
  return !["0", "false", "no"].includes((env.VENDOR_GATE_STRICT ?? "1").toLowerCase());
}

/** CLI entrypoint logic: loads `.env`, runs the gate, prints the report, returns the process exit code. */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  loadRepoDotenv(undefined, env);
  const strict = isStrict(env);
  const { checks, exitCode } = await runGate(env);

  console.log("Vendor connectivity gate");
  console.log("=".repeat(60));
  for (const check of checks) {
    console.log(`  [${check.passed ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
  }

  const blockers = checks.filter((c) => !c.passed);
  if (blockers.length > 0) {
    console.error("\nBlockers:");
    for (const check of blockers) {
      console.error(`  - ${check.name}: ${check.detail}`);
    }
    if (exitCode === 1) {
      console.error("\nSet CLICKUP_API_TOKEN, CLICKUP_LIST_ID, and N8N_API_KEY in .env");
      if (!existsSync(resolve(REPO_ROOT, ".env"))) {
        console.error("(No .env file found at repo root — copy .env.example)");
      }
    } else {
      console.error("\nFix vendor connectivity before running live integration tests.");
    }
    if (!strict) {
      console.error("VENDOR_GATE_STRICT=0 — continuing despite failures (warn-only mode)");
      return 0;
    }
    return exitCode;
  }

  console.log("\nGate passed — safe to run live integration tests and live CLI validation.");
  return 0;
}
