import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFieldMapping } from "../src/marketing-pipeline/logic.js";
import { REPO_ROOT } from "../src/load-env.js";
import { buildCallAgentWorkflow } from "../src/workflows/build-call-agent.js";
import { buildMarketingPipelineWorkflow } from "../src/workflows/build-marketing-pipeline.js";

const CALL_AGENT_OUT = resolve(REPO_ROOT, "n8n", "workflows", "call-agent-subworkflow.json");
const MARKETING_PIPELINE_OUT = resolve(REPO_ROOT, "n8n", "workflows", "marketing-pipeline-main.json");

try {
  const callAgentWorkflow = buildCallAgentWorkflow();
  writeFileSync(CALL_AGENT_OUT, `${JSON.stringify(callAgentWorkflow, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${CALL_AGENT_OUT}`);

  const marketingPipelineWorkflow = buildMarketingPipelineWorkflow(loadFieldMapping());
  writeFileSync(MARKETING_PIPELINE_OUT, `${JSON.stringify(marketingPipelineWorkflow, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${MARKETING_PIPELINE_OUT}`);

  process.exitCode = 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
