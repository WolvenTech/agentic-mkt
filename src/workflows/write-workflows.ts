import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFieldMapping } from "../marketing-pipeline/logic.js";
import { REPO_ROOT } from "../load-env.js";
import { buildCallAgentWorkflow } from "./build-call-agent.js";
import { buildMarketingPipelineWorkflow } from "./build-marketing-pipeline.js";

export const WORKFLOWS_DIR = "integrations/marketing-pipelines";
export const CALL_AGENT_FILENAME = "call-agent-subworkflow.json";
export const MARKETING_PIPELINE_FILENAME = "marketing-pipeline-main.json";

export interface WorkflowExportPaths {
  callAgentPath: string;
  marketingPipelinePath: string;
}

export function defaultWorkflowExportPaths(): WorkflowExportPaths {
  const workflowsDir = resolve(REPO_ROOT, WORKFLOWS_DIR);
  return {
    callAgentPath: resolve(workflowsDir, CALL_AGENT_FILENAME),
    marketingPipelinePath: resolve(workflowsDir, MARKETING_PIPELINE_FILENAME),
  };
}

export function writeWorkflowExports(paths: WorkflowExportPaths): WorkflowExportPaths {
  const callAgentWorkflow = buildCallAgentWorkflow();
  writeFileSync(paths.callAgentPath, `${JSON.stringify(callAgentWorkflow, null, 2)}\n`, "utf-8");

  const marketingPipelineWorkflow = buildMarketingPipelineWorkflow(loadFieldMapping());
  writeFileSync(paths.marketingPipelinePath, `${JSON.stringify(marketingPipelineWorkflow, null, 2)}\n`, "utf-8");

  return paths;
}
