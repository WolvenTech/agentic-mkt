import { loadRepoDotenv } from "../src/load-env.js";
import { publishNewWorkflows, printPublishReport } from "../src/n8n/deploy-workflows.js";

async function main(): Promise<number> {
  loadRepoDotenv();
  const apiKey = (process.env.N8N_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("Set N8N_API_KEY in .env");
    return 1;
  }

  const report = await publishNewWorkflows({
    apiUrl: process.env.N8N_API_URL,
    apiKey,
  });
  printPublishReport(report);
  return 0;
}

try {
  const code = await main();
  process.exitCode = code;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
