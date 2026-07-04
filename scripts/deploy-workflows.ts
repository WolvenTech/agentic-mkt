import { loadRepoDotenv } from "../src/load-env.js";
import { deployWorkflows, printDeployReport } from "../src/n8n/deploy-workflows.js";
import { runGate } from "../src/clickup/vendor-gate.js";

async function main(): Promise<number> {
  loadRepoDotenv();

  // Route through the vendor gate before performing live n8n mutations
  const gateResult = await runGate();
  if (gateResult.exitCode !== 0) {
    console.error("Vendor gate failed — cannot proceed with deploy");
    for (const check of gateResult.checks.filter((c) => !c.passed)) {
      console.error(`  - ${check.name}: ${check.detail}`);
    }
    return gateResult.exitCode;
  }

  const apiKey = (process.env.N8N_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("Set N8N_API_KEY in .env");
    return 1;
  }

  const report = await deployWorkflows({
    apiUrl: process.env.N8N_API_URL,
    apiKey,
  });
  printDeployReport(report);
  return 0;
}

try {
  const code = await main();
  process.exitCode = code;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
