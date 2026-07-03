/**
 * TEMPORARY MIGRATION PARITY TEST — RETIRED
 *
 * This test proves that migrating Code node sources from TypeScript string
 * factories to workflow-local JavaScript files did NOT alter the generated
 * workflow JSON structure or behavior.
 *
 * The baseline was captured from workflow exports on the main branch before
 * the source migration started (commit 6ee93bc and earlier).
 *
 * STATUS: Migration completed and accepted (task_09, task_10).
 * This test and its baseline fixtures at tests/fixtures/migration-parity-baseline/
 * remain in the repository for audit purposes but are no longer active.
 * Future deployments rely on the permanent parity gate: `pnpm build:workflows:check`,
 * which ensures committed exports match the current builder output.
 *
 * TO REMOVE: After final PR merge and deployment, delete this file and
 * tests/fixtures/migration-parity-baseline/ directory. Both are no longer needed.
 *
 * Related ADRs:
 * - ADR-004: Scoped Linting and Migration Parity Gate
 * - ADR-001: Full Mirror MVP
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALL_AGENT_FILENAME,
  MARKETING_PIPELINE_FILENAME,
  writeWorkflowExports,
} from "../src/workflows/write-workflows.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const REPO_ROOT = resolve(__dirname, "..");
const BASELINE_DIR = resolve(REPO_ROOT, "tests", "fixtures", "migration-parity-baseline");

function readNormalized(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("n8n migration parity — temporary baseline check", () => {
  /**
   * TEMPORARY: This test ensures that regenerating workflows from the new
   * source-file model produces identical JSON to the pre-migration baseline.
   * After the migration is accepted, this test can be removed.
   */
  it("Call Agent regenerated JSON exactly matches pre-migration baseline", () => {
    const baselinePath = resolve(BASELINE_DIR, CALL_AGENT_FILENAME);
    const baseline = readNormalized(baselinePath);

    const tempDir = mkdtempSync(resolve(tmpdir(), "agentic-mkt-ca-parity-"));
    try {
      const { callAgentPath } = writeWorkflowExports({
        callAgentPath: resolve(tempDir, CALL_AGENT_FILENAME),
        marketingPipelinePath: resolve(tempDir, MARKETING_PIPELINE_FILENAME),
      });

      const regenerated = readNormalized(callAgentPath);
      expect(regenerated).toBe(
        baseline,
        "Call Agent workflow JSON drifted after source migration. " +
          "This indicates the new JavaScript source files generated different output than the original TypeScript factories. " +
          "Verify that loadCodeNodeSource and token rendering are producing identical jsCode values."
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * TEMPORARY: This test ensures that regenerating workflows from the new
   * source-file model produces identical JSON to the pre-migration baseline.
   * After the migration is accepted, this test can be removed.
   */
  it("Marketing Pipeline regenerated JSON exactly matches pre-migration baseline", () => {
    const baselinePath = resolve(BASELINE_DIR, MARKETING_PIPELINE_FILENAME);
    const baseline = readNormalized(baselinePath);

    const tempDir = mkdtempSync(resolve(tmpdir(), "agentic-mkt-mp-parity-"));
    try {
      const { marketingPipelinePath } = writeWorkflowExports({
        callAgentPath: resolve(tempDir, CALL_AGENT_FILENAME),
        marketingPipelinePath: resolve(tempDir, MARKETING_PIPELINE_FILENAME),
      });

      const regenerated = readNormalized(marketingPipelinePath);
      expect(regenerated).toBe(
        baseline,
        "Marketing Pipeline workflow JSON drifted after source migration. " +
          "This indicates the new JavaScript source files generated different output than the original TypeScript factories. " +
          "Verify that loadCodeNodeSource and token rendering are producing identical jsCode values."
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
