import { defaultWorkflowExportPaths, writeWorkflowExports } from "../src/workflows/write-workflows.js";

try {
  const paths = defaultWorkflowExportPaths();
  writeWorkflowExports(paths);
  console.log(`Wrote ${paths.callAgentPath}`);
  console.log(`Wrote ${paths.marketingPipelinePath}`);
  process.exitCode = 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
