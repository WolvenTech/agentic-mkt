import { loadRepoDotenv } from "../src/load-env.js";
import { n8nClientFromEnv } from "../src/n8n/client.js";

interface WorkflowToClean {
  id: string;
  action: "deactivate" | "delete";
  reason: string;
}

const WORKFLOWS_TO_CLEAN: WorkflowToClean[] = [
  {
    id: "U2IS33I5MAbFidOd",
    action: "deactivate",
    reason: "Original single-agent Marketing Pipeline (06-22), still active — conflicts with new production pipeline on shared webhook path",
  },
  {
    id: "8Ox7Jz5h57nhWNTt",
    action: "delete",
    reason: "Orphan from failed publish retry (07-02 16:16:11)",
  },
  {
    id: "cRDwdCjEbGfC9Flo",
    action: "delete",
    reason: "Orphan from failed publish retry (07-02 16:15:24)",
  },
  {
    id: "YvcepxU0j9kAZoIx",
    action: "delete",
    reason: "Orphan from failed publish retry (07-02 16:15:25)",
  },
  {
    id: "6p6ojqn90F7QFyFV",
    action: "delete",
    reason: "Orphan from failed publish retry (07-02 16:16:11)",
  },
];

async function main(): Promise<number> {
  loadRepoDotenv();
  const apiKey = (process.env.N8N_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("Set N8N_API_KEY in .env");
    return 1;
  }

  const client = n8nClientFromEnv();
  const results: { id: string; action: string; status: string }[] = [];

  for (const workflow of WORKFLOWS_TO_CLEAN) {
    try {
      const live = await client.getWorkflow(workflow.id);

      // Guard rails: verify state matches what was planned
      if (workflow.action === "delete") {
        if (live.active) {
          throw new Error(`Refusing to delete active workflow (expected inactive, got active: true)`);
        }
        const createdAt = new Date(live.createdAt ?? "");
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (createdAt < dayAgo) {
          throw new Error(
            `Refusing to delete workflow created before 24h ago (expected today's date around 07-02 16:15-16:16, got ${live.createdAt})`
          );
        }
      }

      if (workflow.action === "deactivate") {
        await client.deactivateWorkflow(workflow.id);
        results.push({
          id: workflow.id,
          action: "deactivate",
          status: `success — ${workflow.reason}`,
        });
      } else {
        await client.deleteWorkflow(workflow.id);
        results.push({
          id: workflow.id,
          action: "delete",
          status: `success — ${workflow.reason}`,
        });
      }
    } catch (err) {
      results.push({
        id: workflow.id,
        action: workflow.action,
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  console.log("\nCleanup Results:");
  console.log("================\n");
  for (const result of results) {
    console.log(`${result.action.toUpperCase()} ${result.id}`);
    console.log(`  ${result.status}\n`);
  }

  const errors = results.filter((r) => r.status.startsWith("error"));
  if (errors.length > 0) {
    console.error(`\n${errors.length} operation(s) failed.`);
    return 1;
  }

  console.log("✓ All workflows cleaned up successfully.");
  return 0;
}

try {
  const code = await main();
  process.exitCode = code;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
