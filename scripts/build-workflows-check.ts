import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { REPO_ROOT } from "../src/load-env.js";
import {
  CALL_AGENT_FILENAME,
  MARKETING_PIPELINE_FILENAME,
  defaultWorkflowExportPaths,
  writeWorkflowExports,
} from "../src/workflows/write-workflows.js";

function readNormalized(path: string): string {
  return readFileSync(path, "utf-8");
}

try {
  const committed = defaultWorkflowExportPaths();
  const tempDir = mkdtempSync(resolve(tmpdir(), "agentic-mkt-workflows-"));
  const generated = writeWorkflowExports({
    callAgentPath: resolve(tempDir, CALL_AGENT_FILENAME),
    marketingPipelinePath: resolve(tempDir, MARKETING_PIPELINE_FILENAME),
  });

  const diffs: string[] = [];
  for (const [label, committedPath, generatedPath] of [
    ["Call Agent", committed.callAgentPath, generated.callAgentPath],
    ["Marketing Pipeline", committed.marketingPipelinePath, generated.marketingPipelinePath],
  ] as const) {
    const expected = readNormalized(committedPath);
    const actual = readNormalized(generatedPath);
    if (expected !== actual) {
      diffs.push(`${label}: committed ${committedPath} differs from builder output`);
    }
  }

  rmSync(tempDir, { recursive: true, force: true });

  if (diffs.length > 0) {
    console.error("Workflow export check failed — committed JSON is out of date:");
    for (const diff of diffs) {
      console.error(`  - ${diff}`);
    }
    console.error(`Run pnpm build:workflows from ${REPO_ROOT} and commit the updated files.`);
    process.exitCode = 1;
  } else {
    console.log("Workflow export check passed — committed JSON matches builder output.");
    process.exitCode = 0;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
