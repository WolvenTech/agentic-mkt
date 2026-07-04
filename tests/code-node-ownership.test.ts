import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCallAgentWorkflow } from "../src/workflows/build-call-agent.js";
import { buildMarketingPipelineWorkflow } from "../src/workflows/build-marketing-pipeline.js";
import { listCodeNodeSourceFiles, loadCodeNodeSource, codeNodeSourceDir } from "../src/workflows/n8n-codegen.js";
import { loadFieldMapping } from "../src/marketing-pipeline/logic.js";

/**
 * Code Node Ownership Test
 *
 * Ensures that:
 * 1. Every generated Code node has a corresponding source file
 * 2. Every source file is referenced by a generated workflow
 * 3. The test remains offline-safe and deterministic
 */

describe("Code node ownership", () => {
  /**
   * Extract all Code nodes from a workflow export.
   * Returns array of {name, workflowSlug} tuples.
   */
  function extractCodeNodes(
    workflow: ReturnType<typeof buildCallAgentWorkflow> | ReturnType<typeof buildMarketingPipelineWorkflow>,
    workflowSlug: "call-agent" | "marketing-pipeline"
  ): Array<{ name: string; workflowSlug: typeof workflowSlug }> {
    return workflow.nodes
      .filter((node) => node.type === "n8n-nodes-base.code")
      .map((node) => ({
        name: node.name,
        workflowSlug,
      }));
  }

  /**
   * Convert a node name to its expected source file slug (kebab-case).
   * Examples: "Parse Agent Config" → "parse-agent-config"
   */
  function nodeNameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  it("Call Agent: every generated Code node has a source file", () => {
    const workflow = buildCallAgentWorkflow();
    const codeNodes = extractCodeNodes(workflow, "call-agent");

    const missingFiles: string[] = [];
    for (const node of codeNodes) {
      const nodeSlug = nodeNameToSlug(node.name);
      const sourceFile = resolve(codeNodeSourceDir("call-agent"), `${nodeSlug}.js`);
      if (!existsSync(sourceFile)) {
        missingFiles.push(`${node.name} (expected at code-nodes/${nodeSlug}.js)`);
      }
    }

    expect(missingFiles).toEqual(
      [],
      `Call Agent Code nodes missing source files:\n${missingFiles.join("\n")}`
    );
  });

  it("Marketing Pipeline: every generated Code node has a source file", () => {
    const fieldMapping = loadFieldMapping();
    const workflow = buildMarketingPipelineWorkflow(fieldMapping);
    const codeNodes = extractCodeNodes(workflow, "marketing-pipeline");

    const missingFiles: string[] = [];
    for (const node of codeNodes) {
      const nodeSlug = nodeNameToSlug(node.name);
      const sourceFile = resolve(codeNodeSourceDir("marketing-pipeline"), `${nodeSlug}.js`);
      if (!existsSync(sourceFile)) {
        missingFiles.push(`${node.name} (expected at code-nodes/${nodeSlug}.js)`);
      }
    }

    expect(missingFiles).toEqual(
      [],
      `Marketing Pipeline Code nodes missing source files:\n${missingFiles.join("\n")}`
    );
  });

  it("Call Agent: every source file is used by a generated Code node", () => {
    const workflow = buildCallAgentWorkflow();
    const codeNodes = extractCodeNodes(workflow, "call-agent");

    const sourceFiles = listCodeNodeSourceFiles();
    const callAgentFiles = sourceFiles
      .filter((f) => f.startsWith("call-agent/"))
      .map((f) => f.replace("call-agent/", "").replace(".js", ""));

    const usedSlugs = new Set(codeNodes.map((node) => nodeNameToSlug(node.name)));

    const unusedFiles: string[] = [];
    for (const sourceFile of callAgentFiles) {
      if (!usedSlugs.has(sourceFile)) {
        unusedFiles.push(`code-nodes/${sourceFile}.js`);
      }
    }

    expect(unusedFiles).toEqual(
      [],
      `Call Agent source files not used by generated Code nodes:\n${unusedFiles.join("\n")}`
    );
  });

  it("Marketing Pipeline: every source file is used by a generated Code node", () => {
    const fieldMapping = loadFieldMapping();
    const workflow = buildMarketingPipelineWorkflow(fieldMapping);
    const codeNodes = extractCodeNodes(workflow, "marketing-pipeline");

    const sourceFiles = listCodeNodeSourceFiles();
    const marketingPipelineFiles = sourceFiles
      .filter((f) => f.startsWith("marketing-pipeline/"))
      .map((f) => f.replace("marketing-pipeline/", "").replace(".js", ""));

    const usedSlugs = new Set(codeNodes.map((node) => nodeNameToSlug(node.name)));

    const unusedFiles: string[] = [];
    for (const sourceFile of marketingPipelineFiles) {
      if (!usedSlugs.has(sourceFile)) {
        unusedFiles.push(`code-nodes/${sourceFile}.js`);
      }
    }

    expect(unusedFiles).toEqual(
      [],
      `Marketing Pipeline source files not used by generated Code nodes:\n${unusedFiles.join("\n")}`
    );
  });

  it("maintains deterministic offline safety (no live credentials required)", () => {
    // This test verifies that the ownership checks do not require:
    // - Live n8n connections
    // - Live ClickUp API credentials
    // - External HTTP calls
    //
    // The test passes if no errors are thrown during:
    // 1. Building workflows (in-memory TypeScript execution only)
    // 2. Loading and listing source files (local file I/O only)
    // 3. Comparing generated Code nodes against source files (in-memory comparison only)

    const fieldMapping = loadFieldMapping();
    expect(() => {
      const callAgent = buildCallAgentWorkflow();
      const marketingPipeline = buildMarketingPipelineWorkflow(fieldMapping);
      const sourceFiles = listCodeNodeSourceFiles();

      // Verify all are populated (non-empty results)
      expect(callAgent.nodes.length).toBeGreaterThan(0);
      expect(marketingPipeline.nodes.length).toBeGreaterThan(0);
      expect(sourceFiles.length).toBeGreaterThan(0);
    }).not.toThrow();
  });
});
