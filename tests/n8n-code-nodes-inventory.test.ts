import { readdir, readFile } from "fs/promises";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { beforeAll, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKFLOWS_DIR = resolve(__dirname, "../src/workflows");

describe("n8n Code Node Source Inventory", () => {
  let callAgentCodeNodeFiles: string[] = [];
  let marketingPipelineCodeNodeFiles: string[] = [];

  beforeAll(async () => {
    const callAgentDir = resolve(WORKFLOWS_DIR, "call-agent/code-nodes");
    const marketingPipelineDir = resolve(WORKFLOWS_DIR, "marketing-pipeline/code-nodes");

    callAgentCodeNodeFiles = await readdir(callAgentDir).catch(() => []);
    marketingPipelineCodeNodeFiles = await readdir(marketingPipelineDir).catch(() => []);
  });

  it("should have 5 Call Agent Code node source files", () => {
    expect(callAgentCodeNodeFiles.length).toBe(5);
  });

  it("should have 25 Marketing Pipeline Code node source files", () => {
    expect(marketingPipelineCodeNodeFiles.length).toBe(25);
  });

  it("should have all expected Call Agent Code node files", () => {
    const expectedFiles = [
      "store-input-context.js",
      "parse-agent-config.js",
      "assemble-prompt.js",
      "parse-agent-output.js",
      "unsupported-provider-error.js",
    ];
    expectedFiles.forEach((file) => {
      expect(callAgentCodeNodeFiles).toContain(file);
    });
  });

  it("should have all expected Marketing Pipeline Code node files", () => {
    const expectedFiles = [
      "set-staged-ingress.js",
      "extract-webhook-context.js",
      "mark-history-item-seen.js",
      "extract-task-fields.js",
      "collect-task-comments.js",
      "prepare-staged-call-agent-input.js",
      "format-draft-comment.js",
      "agent-parse-failure.js",
      "log-duplicate-ingress.js",
      "detect-blocker.js",
      "doc-created.js",
      "doc-ready.js",
      "extract-latest-lead-feedback.js",
      "extract-stage.js",
      "find-stage-page.js",
      "format-blocker-comment.js",
      "format-pointer-comment.js",
      "page-created.js",
      "persist-doc-pointer.js",
      "read-current-page.js",
      "replace-doc-page.js",
      "update-status-to-next-gate.js",
      "update-status-to-previous-gate.js",
      "use-existing-doc.js",
      "validate-staged-artifact.js",
    ];
    expectedFiles.forEach((file) => {
      expect(marketingPipelineCodeNodeFiles).toContain(file);
    });
  });

  it("should contain placeholder tokens in parameterized Call Agent source files", async () => {
    const assemblePromptPath = resolve(WORKFLOWS_DIR, "call-agent/code-nodes/assemble-prompt.js");
    const content = await readFile(assemblePromptPath, "utf8").catch(() => "");

    // Check for placeholder tokens
    expect(content).toContain("@@DEFAULT_TEMPERATURE@@");
    expect(content).toContain("@@DEFAULT_MAX_OUTPUT_TOKENS@@");
    expect(content).toContain("@@DEFAULT_PROVIDER@@");
    expect(content).toContain("@@DEFAULT_MODEL@@");
  });

  it("should contain placeholder tokens in parameterized Marketing Pipeline source files", async () => {
    const extractTaskFieldsPath = resolve(WORKFLOWS_DIR, "marketing-pipeline/code-nodes/extract-task-fields.js");
    const content = await readFile(extractTaskFieldsPath, "utf8").catch(() => "");

    // Check for placeholder tokens
    expect(content).toContain("@@FIELD_ID_CRITERIOS_DE_ACEITE@@");
    expect(content).toContain("@@FIELD_ID_AGENT_ID@@");
    expect(content).toContain("@@DEFAULT_AGENT_ID@@");
  });
});
