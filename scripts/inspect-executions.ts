import { loadRepoDotenv } from "../src/load-env.js";
import {
  n8nClientFromEnv,
  summarizeExecution,
  type ExecutionSummary,
  type N8nClient,
  type N8nExecution,
} from "../src/n8n/client.js";
import { runGate } from "../src/clickup/vendor-gate.js";

export const MARKETING_PIPELINE_NAME = "Marketing Pipeline";
export const DEFAULT_MINUTES = 15;

/** Parse `--minutes N` or `--minutes=N` from CLI args; defaults to 15. */
export function parseMinutesFlag(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--minutes") {
      const raw = argv[i + 1];
      if (!raw) {
        throw new Error("--minutes requires a value");
      }
      return parsePositiveMinutes(raw);
    }
    if (arg.startsWith("--minutes=")) {
      return parsePositiveMinutes(arg.slice("--minutes=".length));
    }
  }
  return DEFAULT_MINUTES;
}

function parsePositiveMinutes(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--minutes must be a positive integer");
  }
  return parsed;
}

export interface InspectRow {
  id: string;
  status: string;
  task_id: string;
  transition: string;
  path: string;
  duration: string;
  failed_node: string;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function buildInspectRow(execution: N8nExecution, summary: ExecutionSummary): InspectRow {
  return {
    id: summary.execution_id,
    status: String(execution.status ?? ""),
    task_id: summary.task_id,
    transition: summary.transition,
    path: summary.path,
    duration: formatDurationMs(summary.duration_ms),
    failed_node: summary.failed_node ?? "",
  };
}

function columnWidths(rows: InspectRow[]): Record<keyof InspectRow, number> {
  const keys = ["id", "status", "task_id", "transition", "path", "duration", "failed_node"] as const;
  const widths = {} as Record<keyof InspectRow, number>;
  for (const key of keys) {
    widths[key] = Math.max(key.length, ...rows.map((row) => row[key].length));
  }
  return widths;
}

export function formatInspectTable(rows: InspectRow[]): string {
  if (rows.length === 0) {
    return "No executions in window.";
  }

  const widths = columnWidths(rows);
  const keys = ["id", "status", "task_id", "transition", "path", "duration", "failed_node"] as const;
  const header = keys.map((key) => key.padEnd(widths[key])).join("  ");
  const divider = keys.map((key) => "-".repeat(widths[key])).join("  ");
  const body = rows.map((row) => keys.map((key) => row[key].padEnd(widths[key])).join("  ")).join("\n");
  return `${header}\n${divider}\n${body}`;
}

function executionsInWindow(executions: N8nExecution[], cutoffMs: number): N8nExecution[] {
  return executions
    .filter((execution) => {
      const started = execution.startedAt ? Date.parse(execution.startedAt) : Number.NaN;
      return Number.isFinite(started) && started >= cutoffMs;
    })
    .sort((a, b) => Date.parse(b.startedAt ?? "0") - Date.parse(a.startedAt ?? "0"));
}

export async function inspectExecutions(
  client: N8nClient,
  minutes: number,
  workflowName = MARKETING_PIPELINE_NAME
): Promise<InspectRow[]> {
  const workflows = await client.listWorkflows();
  const workflow = workflows.find((entry) => entry.name === workflowName);
  if (!workflow) {
    throw new Error(`${workflowName} workflow not found in n8n`);
  }

  const cutoffMs = Date.now() - minutes * 60 * 1000;
  const listed = await client.listExecutions({ workflowId: workflow.id, limit: 50 });
  const recent = executionsInWindow(listed, cutoffMs);

  const rows: InspectRow[] = [];
  for (const brief of recent) {
    const full = await client.getExecution(brief.id, true);
    rows.push(buildInspectRow(full, summarizeExecution(full)));
  }
  return rows;
}

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  loadRepoDotenv(undefined, env);

  // Route through the vendor gate before performing live n8n operations
  const gateResult = await runGate(env);
  if (gateResult.exitCode !== 0) {
    console.error("Vendor gate failed — cannot proceed with inspect");
    for (const check of gateResult.checks.filter((c) => !c.passed)) {
      console.error(`  - ${check.name}: ${check.detail}`);
    }
    return gateResult.exitCode;
  }

  let minutes: number;
  try {
    minutes = parseMinutesFlag(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  let client: N8nClient;
  try {
    client = n8nClientFromEnv(env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  try {
    const rows = await inspectExecutions(client, minutes);
    console.log(`Marketing Pipeline executions (last ${minutes}m): ${rows.length}`);
    console.log(formatInspectTable(rows));
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

try {
  const code = await main();
  process.exitCode = code;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
