import { describe, expect, it } from "vitest";
import { REQUIRED_STAGE_OUTPUT_KEYS } from "../call-agent/logic.js";
import { buildCallAgentWorkflow, GPT_NODE_NAME } from "./build-call-agent.js";
import type { N8nNode } from "./build-call-agent.js";

describe("buildCallAgentWorkflow (sub-workflow topology)", () => {
  const workflow = buildCallAgentWorkflow();
  const nodesByName = new Map<string, N8nNode>(workflow.nodes.map((node) => [node.name, node]));

  it("is not a placeholder stub", () => {
    expect(workflow).not.toHaveProperty("_comment");
    expect(workflow.nodes.length).toBeGreaterThan(0);
  });

  it("contains the Execute Workflow trigger and OpenAI node types", () => {
    const nodeTypes = new Set(workflow.nodes.map((node) => node.type));
    for (const expected of [
      "n8n-nodes-base.executeWorkflowTrigger",
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.github",
      "n8n-nodes-base.merge",
      "@n8n/n8n-nodes-langchain.openAi",
      "n8n-nodes-base.code",
      "n8n-nodes-base.if",
    ]) {
      expect(nodeTypes.has(expected)).toBe(true);
    }
  });

  it("github nodes fetch the agent config and skill/reference paths, with retry configured", () => {
    const githubNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.github");
    expect(githubNodes).toHaveLength(2);
    const filePaths = githubNodes.map((node) => String((node.parameters as { filePath?: string }).filePath ?? ""));
    expect(filePaths.join(" ")).toContain("agent_id");
    expect(filePaths.join(" ")).toContain("path");
    for (const node of githubNodes) {
      expect(node.retryOnFail).toBe(true);
      expect(node.maxTries).toBe(2);
    }
  });

  it("GPT node sends instructions, user message, and maxTokens", () => {
    const gpt = nodesByName.get(GPT_NODE_NAME);
    const params = gpt?.parameters as {
      resource?: string;
      operation?: string;
      simplify?: boolean;
      modelId?: { value?: string };
      responses?: { values?: Array<{ content?: string; role?: string; type?: string }> };
      options?: { instructions?: string; maxTokens?: string };
    };
    expect(params.resource).toBeUndefined();
    expect(params.operation).toBeUndefined();
    expect(params.simplify).toBeUndefined();
    expect(params.modelId?.value).toContain("gpt-4.1-mini");
    expect(params.options?.instructions).toContain("system_prompt");
    expect(params.responses?.values?.[0]?.content).toContain("user_message");
    expect(params.responses?.values?.[0]?.role).toBeUndefined();
    expect(params.responses?.values?.[0]?.type).toBeUndefined();
    expect(params.options?.maxTokens).toContain("max_output_tokens");
  });

  it("Route Provider accepts openai and google", () => {
    const route = nodesByName.get("Route Provider");
    const conditions = (route?.parameters as { conditions?: { combinator?: string; conditions?: Array<{ rightValue?: string }> } })
      ?.conditions;
    expect(conditions?.combinator).toBe("or");
    const values = (conditions?.conditions ?? []).map((c) => c.rightValue).sort();
    expect(values).toEqual(["google", "openai"]);
  });

  it("Parse Agent Output node uses the staged-only parser", () => {
    const parseNode = nodesByName.get("Parse Agent Output");
    const code = String((parseNode?.parameters as { jsCode?: string }).jsCode ?? "");
    for (const key of REQUIRED_STAGE_OUTPUT_KEYS) {
      expect(code).toContain(key);
    }
    expect(code).toContain("STAGE_DEFINITIONS");
    expect(code).toContain("stage");
    expect(code).toContain("artifact_markdown");
    expect(code).not.toContain("deliverable_markdown");
  });

  it("pins a hardcoded test input for isolation runs", () => {
    const hardcoded = nodesByName.get("Hardcoded Test Input");
    const payload = JSON.parse(String((hardcoded?.parameters as { jsonOutput?: string }).jsonOutput ?? "{}"));
    expect(payload.agent_id).toBe("investigative-brief");
    const pin = (workflow.pinData as Record<string, Array<{ json: { agent_id: string } }>>)["When Executed by Another Workflow"];
    expect(pin?.[0]?.json.agent_id).toBe("investigative-brief");
  });

  it("re-imports without structural errors: every node and connection target is well-formed", () => {
    for (const node of workflow.nodes) {
      expect(node.name).toBeTruthy();
      expect(node.type).toBeTruthy();
      expect(node.parameters).toBeDefined();
      expect(node.position).toBeDefined();
    }
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      expect(nodesByName.has(source)).toBe(true);
      for (const branch of outputs.main) {
        for (const link of branch) {
          expect(nodesByName.has(link.node)).toBe(true);
        }
      }
    }
  });

  it("routes unsupported providers to an error envelope", () => {
    const errorNode = nodesByName.get("Unsupported Provider Error");
    const code = String((errorNode?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(code).toContain("error");
    expect(code).toContain("raw_response");
  });

  it("runs with no environment variables set (offline, no network access)", () => {
    const restore = { ...process.env };
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    try {
      expect(() => buildCallAgentWorkflow()).not.toThrow();
    } finally {
      process.env = restore;
    }
  });
});
