import { loadRepoDotenv } from "../src/load-env.js";
import { deployWorkflows, printDeployReport } from "../src/n8n/deploy-workflows.js";

async function main(): Promise<number> {
  loadRepoDotenv();
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
