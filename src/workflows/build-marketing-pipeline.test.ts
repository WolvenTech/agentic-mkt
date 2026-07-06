import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  fieldId,
  loadFieldMapping,
  workflowConnectionPath,
} from "../marketing-pipeline/logic.js";
import type { FieldMapping } from "../types/field-mapping.js";
import { AGENT_WORKING_TAG, FORMAT_STAGE, INVESTIGATE_STAGE, WRITE_STAGE } from "../marketing-pipeline/stages.js";
import { buildMarketingPipelineWorkflow } from "./build-marketing-pipeline.js";
import { loadCodeNodeSource } from "./n8n-codegen.js";

function fixtureFieldMapping(): FieldMapping {
  const mapping = loadFieldMapping();
  mapping.custom_fields.criterios_de_aceite!.clickup_field_id = "cf_criterios_001";
  mapping.custom_fields.agent_id!.clickup_field_id = "cf_agent_id_001";
  mapping.custom_fields.editorial_doc_url!.clickup_field_id = "cf_editorial_doc_url_001";
  return mapping;
}

function nodeByName(workflow: ReturnType<typeof buildMarketingPipelineWorkflow>, name: string) {
  return workflow.nodes.find((node) => node.name === name);
}

describe("Marketing Pipeline topology", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);
  const nodes = new Set(workflow.nodes.map((node) => node.name));

  it("routes staged ingress directly into staged processing", () => {
    expect(workflow.connections["Extract Stage"]?.main).toEqual([
      [{ node: "Set Staged Ingress", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Set Staged Ingress"]?.main).toEqual([
      [{ node: "Extract Webhook Context", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Add agent-working"]?.main).toEqual([
      [{ node: "GET Task Comments", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Collect Task Comments"]?.main).toEqual([
      [{ node: "Has Doc URL?", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Prepare Staged Call Agent Input"]?.main).toEqual([
      [{ node: "Execute Call Agent", type: "main", index: 0 }],
    ]);
  });

  it("keeps dedup filtering before staged processing starts", () => {
    expect(workflow.connections["Extract Webhook Context"]?.main).toEqual([
      [{ node: "Dedup?", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Dedup?"]?.main).toEqual([
      [{ node: "Log Duplicate Ingress", type: "main", index: 0 }],
      [{ node: "Mark History Item Seen", type: "main", index: 0 }],
    ]);
  });

  it("removes legacy ready/review/revision nodes from the generated workflow", () => {
    for (const removedNode of [
      "Staged or Ready?",
      "Needs Review?",
      "Set First Draft Ingress",
      "Set Revision Ingress",
      "Revision Ingress?",
      "Prepare Revision Call Agent Input",
      "Prepare Call Agent Input",
      "Set Needs Review Skip Target",
      "Status → In Progress",
    ]) {
      expect(nodes.has(removedNode), removedNode).toBe(false);
    }
    for (const tagNode of ["Add agent-working", "Clear activity tags", "Swap activity tags"]) {
      expect(nodes.has(tagNode), tagNode).toBe(true);
    }
  });

  it("fetches review comments through the built-in ClickUp comment getAll operation", () => {
    const node = nodeByName(workflow, "GET Task Comments");
    expect(node?.type).toBe("n8n-nodes-base.clickUp");
    expect(node?.credentials).toEqual({
      clickUpApi: { id: "CLICKUP_CREDENTIAL_ID", name: "ClickUp Marketing Pipeline" },
    });
    expect(node?.parameters).toMatchObject({
      resource: "comment",
      operation: "getAll",
      commentsOn: "task",
      id: "={{ $('Extract Task Fields').item.json.task_id }}",
    });
    expect((node?.parameters as { limit?: unknown }).limit).toBeUndefined();
    expect(node?.alwaysOutputData).toBe(true);
  });

  it("keeps the staged execution chain connected from activity tag to Call Agent", () => {
    expect(workflowConnectionPath(workflow, "Add agent-working", "Execute Call Agent")).toEqual([
      "Add agent-working",
      "GET Task Comments",
      "Collect Task Comments",
      "Has Doc URL?",
      "Use Existing Doc",
      "Doc Ready",
      "GET List Doc Pages",
      "Find Stage Page",
      "Page Exists?",
      "Page Ready",
      "GET Doc Page Content",
      "Read Current Page",
      "Extract Latest Lead Feedback",
      "Prepare Staged Call Agent Input",
      "Execute Call Agent",
    ]);
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Status → Review")).toContain(
      "Execute Call Agent"
    );
  });

  it("uses the exact agent-working tag name in generated workflow content", () => {
    const serialized = JSON.stringify(workflow);
    expect(serialized).toContain(AGENT_WORKING_TAG);
    expect(serialized).not.toContain("agen-working");
  });

  it("uses first() instead of paired item lookup on the final approval status update", () => {
    const node = nodeByName(workflow, "Status → Review");
    const params = node?.parameters as { id?: string };
    expect(params.id).toBe("={{ $('Extract Task Fields').first().json.task_id }}");
    expect(params.id).not.toContain(".item.json");
  });

  it("does not contain old revision cap, restart, raw HTTP, or revision_count machinery", () => {
    for (const removedNode of [
      "Revision Cap OK?",
      "Increment Revision Count",
      "Cap Reset → Backlog",
      "Reset Revision Count",
      "Strip Restart Draft Prefix",
      "Update Restart Draft Title",
    ]) {
      expect(nodes.has(removedNode)).toBe(false);
    }
    expect(JSON.stringify(workflow)).not.toContain("CLICKUP_API_TOKEN_ID");
    expect(JSON.stringify(workflow)).not.toContain("httpHeaderAuth");
    expect(JSON.stringify(workflow)).not.toContain("revision_count");
  });
});

describe("n8n Doc and page helper code generation", () => {
  // normalizeDocPointerJs/normalizeStoredDocPointerJs from the pre-migration TS factory module
  // were consolidated into use-existing-doc.js; their assertions are now covered by the
  // "Use Existing Doc" tests below, which target the same source file.
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  function conditionLeftValue(nodeName: string): string {
    const node = nodeByName(workflow, nodeName);
    const params = node?.parameters as {
      conditions?: { conditions?: Array<{ leftValue?: string }> };
    };
    return params?.conditions?.conditions?.[0]?.leftValue ?? "";
  }

  it("generates the Has Doc URL? IF expression from editorial_doc_url", () => {
    const expr = conditionLeftValue("Has Doc URL?");
    expect(expr).toContain("editorial_doc_url");
    expect(expr).toContain("Extract Task Fields");
  });

  it("generates Use Existing Doc code reusing editorial_doc_url as doc_id", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "use-existing-doc" });
    expect(code).toContain("editorial_doc_url");
    expect(code).toContain("doc_id");
    expect(code).toContain("doc_created: false");
    expect(code).toContain("use_existing_doc");
    expect(code).toContain("workspace_id");
  });

  it("generates Doc Created code validating the HTTP response id", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "doc-created" });
    expect(code).toContain("$json.id");
    expect(code).toContain("doc_created: true");
    expect(code).toContain("created_doc");
    expect(code).toContain("did not include id");
  });

  it("generates Find Stage Page code with stage-to-page-name mapping from ALL_STAGES", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "find-stage-page" });
    expect(code).toContain("STAGE_TO_PAGE_NAME");
    expect(code).toContain(INVESTIGATE_STAGE.page_name);
    expect(code).toContain(WRITE_STAGE.page_name);
    expect(code).toContain(FORMAT_STAGE.page_name);
    expect(code).toContain("page_id");
    expect(code).toContain("Doc Ready");
  });

  it("generates the Page Exists? IF expression from page_id", () => {
    const expr = conditionLeftValue("Page Exists?");
    expect(expr).toContain("page_id");
  });

  it("generates Page Created code validating the HTTP response id", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "page-created" });
    expect(code).toContain("$json.id");
    expect(code).toContain("Find Stage Page");
    expect(code).toContain("did not include id");
  });

  it("generates page read code that reshapes the HTTP response content", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "read-current-page" });
    expect(code).toContain("page_content");
    expect(code).toContain("$json.content");
    expect(code).toContain("did not include content");
  });

  it("generates page replacement code carrying Format Pointer Comment fields forward", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "replace-doc-page" });
    expect(code).toContain("Format Pointer Comment");
    expect(code).toContain("page_replaced");
    expect(code).toContain("page_replaced: true");
  });

  it("generates Persist Doc Pointer code that writes created Doc URL to custom field", () => {
    const code = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "persist-doc-pointer",
      tokens: { FIELD_ID_EDITORIAL_DOC_URL: fieldId(mapping, "editorial_doc_url") },
    });
    expect(code).toContain("Doc Created");
    expect(code).toContain("Extract Task Fields");
    expect(code).toContain("https://app.clickup.com/${docData.workspace_id}/v/dc/${docData.doc_id}");
    expect(code).toContain("editorial_doc_url: docUrl");
    expect(code).toContain("editorial_doc_url_field_id");
    expect(code).toContain("cf_editorial_doc_url_001");
    expect(code).toContain("persist_doc_pointer");
  });

  it("generates Use Existing Doc code with Doc pointer normalization for URLs and bare IDs", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "use-existing-doc" });
    expect(code).toContain("doc.clickup.com");
    expect(code).toContain("app.clickup.com");
    expect(code).toContain("/\\/dc\\/([a-z0-9-]+)/i");
    expect(code).toContain("pointer");
    expect(code).toContain("Invalid Doc pointer format");
    expect(code).toContain("Expected ClickUp Doc URL or bare Doc ID");
  });
});

describe("n8n stage input preparation code", () => {
  // selectPriorDocPageJs's dedicated node no longer exists: the migration folded
  // stage-to-page-name resolution into find-stage-page.js (covered above) and the
  // TypeScript-level behavior is covered by the selectPriorDocPageName tests in
  // src/marketing-pipeline/logic.test.ts.
  // extractLatestLeadFeedbackJs is superseded by the runtime equivalence test in
  // tests/consistency/n8n-code-equivalence.test.ts, which exercises the same source file end-to-end.

  it("generates prepare staged call agent input code", () => {
    const code = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "prepare-staged-call-agent-input",
      tokens: { DEFAULT_MODEL },
    });

    expect(code).toContain("stage");
    expect(code).toContain("prior_stage_artifact");
    expect(code).toContain("lead_feedback");
    expect(code).toContain("model");
    expect(code).toContain("Extract Task Fields");
    expect(code).toContain("Read Current Page");
    expect(code).toContain("Extract Latest Lead Feedback");
  });

  it("n8n code matches TypeScript stage input structure", () => {
    const prepareCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "prepare-staged-call-agent-input",
      tokens: { DEFAULT_MODEL },
    });

    // Verify all StageInput fields are present in generated code
    expect(prepareCode).toContain("agent_id");
    expect(prepareCode).toContain("stage");
    expect(prepareCode).toContain("task_title");
    expect(prepareCode).toContain("task_description");
    expect(prepareCode).toContain("criterios_de_aceite");
    expect(prepareCode).toContain("prior_stage_artifact");
    expect(prepareCode).toContain("lead_feedback");
    expect(prepareCode).toContain("model");
  });
});

describe("staged success output handling (task_17)", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  it("formats pointer comment for staged success with [CQ-AI] prefix", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-pointer-comment" });
    expect(code).toContain("[CQ-AI]");
    expect(code).toContain("Execute Call Agent");
    expect(code).toContain("Extract Task Fields");
    expect(code).toContain("resumo");
    expect(code).toContain("self_check");
    expect(code).toContain("next_gate");
  });

  it("formats pointer comment to summarize what changed from artifact", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-pointer-comment" });
    expect(code).toContain("artifact_markdown");
    expect(code).toContain("firstLine");
    expect(code).toContain("whatChanged");
    expect(code).toContain("**What changed:**");
  });

  it("formats pointer comment with resumo and self-check summaries", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-pointer-comment" });
    expect(code).toContain("**Summary:**");
    expect(code).toContain("**Self-check:**");
    expect(code).toContain("agentOutput.resumo");
    expect(code).toContain("agentOutput.self_check");
  });

  it("formats pointer comment indicating next action (gate)", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-pointer-comment" });
    expect(code).toContain("Moving to");
    expect(code).toContain("agentOutput.next_gate");
  });

  it("updates task status to the stage's next_gate using dynamic value", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-next-gate" });
    expect(code).toContain("Format Pointer Comment");
    expect(code).toContain("next_gate");
    expect(code).toContain("STATUS_MAP");
    expect(code).toContain("brief review");
    expect(code).toContain("content review");
    expect(code).toContain("final review");
  });

  it("status update carries task identity from Format Pointer Comment (no direct re-fetch)", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-next-gate" });
    expect(code).toContain("...commentData");
    expect(code).not.toContain("$input.all()");
    expect(code).not.toContain(".map(");
  });

  it("Format Pointer Comment uses .first() for stable task identity reference", () => {
    // Update Status to Next Gate no longer re-fetches Extract Task Fields directly (it
    // inherits task_id via the ...commentData spread above); this test keeps the original
    // regression guard against $input.all()/.map()-based identity lookups pinned to the
    // file that actually performs the fetch now.
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-pointer-comment" });
    expect(code).toContain("$('Extract Task Fields').first()");
    expect(code).not.toContain("$input.all()");
    expect(code).not.toContain(".map(");
  });

  it("status update maps next_gate to display status values", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-next-gate" });
    expect(code).toContain("'brief review': 'Brief Review'");
    expect(code).toContain("'content review': 'Content Review'");
    expect(code).toContain("'final review': 'Final Review'");
  });

  it("status update throws on invalid next_gate values", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-next-gate" });
    expect(code).toContain("throw new Error");
    expect(code).toContain("Invalid next_gate");
  });

  it("routes Agent Output OK to Staged Success conditional", () => {
    const agentOutputNode = nodeByName(workflow, "Agent Output OK?");
    expect(agentOutputNode).toBeDefined();
    const connections = workflow.connections["Agent Output OK?"]?.main ?? [];
    expect(connections[0]?.[0]?.node).toBe("Staged Success?");
  });

  it("branches Staged Success to blocker detection on success, draft path on fallback", () => {
    const branches = workflow.connections["Staged Success?"]?.main ?? [];
    expect(branches[0]?.[0]?.node).toBe("Detect Blocker");
    expect(branches[1]?.[0]?.node).toBe("Format Draft Comment");
  });

  it("pointer path chains: Format -> Replace -> POST -> Update -> Set Status", () => {
    const nodes = [
      "Format Pointer Comment",
      "Replace Doc Page",
      "POST Pointer Comment",
      "Clear activity tags",
      "Remove agent-blocked tag",
      "Update Status to Next Gate",
      "Status → Next Gate",
    ];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const from = nodes[i];
      const to = nodes[i + 1];
      expect(workflowConnectionPath(workflow, from, to), `${from} -> ${to}`).not.toBeNull();
    }
  });
});

describe("n8n blocker code generation", () => {
  it("generates detect blocker code that checks blocker_question field", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "detect-blocker" });
    expect(code).toContain("blocker_question");
    expect(code).toContain("has_blocker");
    expect(code).toContain("Execute Call Agent");
  });

  it("generates blocker comment formatting code with [CQ-BLOCKER] prefix", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-blocker-comment" });
    expect(code).toContain("[CQ-BLOCKER]");
    expect(code).toContain("blocker_question");
    expect(code).toContain("STAGE_NAMES");
  });

  it("generates blocker comment code with stage context", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-blocker-comment" });
    expect(code).toContain("investigation phase");
    expect(code).toContain("argument phase");
    expect(code).toContain("formatting phase");
  });

  it("generates previous gate status update code", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    expect(code).toContain("STAGE_TO_PREVIOUS_GATE");
    expect(code).toContain("investigate");
    expect(code).toContain("write");
    expect(code).toContain("format");
    expect(code).toContain("backlog");
    expect(code).toContain("brief review");
    expect(code).toContain("content review");
  });

  it("previous gate code maps to display status values", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    expect(code).toContain("Backlog");
    expect(code).toContain("Brief Review");
    expect(code).toContain("Content Review");
  });

  it("previous gate code validates stage and gate values", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    expect(code).toContain("throw new Error");
    expect(code).toContain("Invalid stage");
    expect(code).toContain("Invalid previous_gate");
  });
});

describe("blocker workflow topology", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  it("has Detect Blocker node in workflow", () => {
    const node = nodeByName(workflow, "Detect Blocker");
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.code");
  });

  it("has Has Blocker IF node in workflow", () => {
    const node = nodeByName(workflow, "Has Blocker?");
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.if");
  });

  it("has Format Blocker Comment node in workflow", () => {
    const node = nodeByName(workflow, "Format Blocker Comment");
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.code");
  });

  it("has POST Blocker Comment node in workflow", () => {
    const node = nodeByName(workflow, "POST Blocker Comment");
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.clickUp");
  });

  it("has Update Status to Previous Gate node in workflow", () => {
    const node = nodeByName(workflow, "Update Status to Previous Gate");
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.code");
  });

  it("has Status → Previous Gate node in workflow", () => {
    const node = nodeByName(workflow, "Status → Previous Gate");
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.clickUp");
  });

  it("has activity tag lifecycle nodes in workflow", () => {
    expect(nodeByName(workflow, "Add agent-working")?.type).toBe("n8n-nodes-base.clickUp");
    expect(nodeByName(workflow, "Clear activity tags")?.type).toBe("n8n-nodes-base.clickUp");
    expect(nodeByName(workflow, "Remove agent-blocked tag")?.type).toBe("n8n-nodes-base.clickUp");
    expect(nodeByName(workflow, "Swap activity tags")?.type).toBe("n8n-nodes-base.clickUp");
    expect(nodeByName(workflow, "Add agent-blocked tag")?.type).toBe("n8n-nodes-base.clickUp");
  });

  it("routes Staged Success to Detect Blocker for staged outputs", () => {
    const branches = workflow.connections["Staged Success?"]?.main ?? [];
    expect(branches[0]?.[0]?.node).toBe("Detect Blocker");
  });

  it("routes Detect Blocker to Has Blocker IF node", () => {
    const connections = workflow.connections["Detect Blocker"]?.main ?? [];
    expect(connections[0]?.[0]?.node).toBe("Has Blocker?");
  });

  it("routes Has Blocker true to Format Blocker Comment", () => {
    const branches = workflow.connections["Has Blocker?"]?.main ?? [];
    expect(branches[0]?.[0]?.node).toBe("Format Blocker Comment");
  });

  it("routes Has Blocker false to Validate Staged Artifact", () => {
    const branches = workflow.connections["Has Blocker?"]?.main ?? [];
    expect(branches[1]?.[0]?.node).toBe("Validate Staged Artifact");
  });

  it("validates staged artifact before formatting pointer comment", () => {
    const connection = workflow.connections["Validate Staged Artifact"]?.main ?? [];
    expect(connection[0]?.[0]?.node).toBe("Format Pointer Comment");
  });

  it("routes success cleanup before next-gate status return", () => {
    expect(workflow.connections["POST Pointer Comment"]?.main).toEqual([
      [{ node: "Clear activity tags", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Clear activity tags"]?.main).toEqual([
      [{ node: "Remove agent-blocked tag", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Remove agent-blocked tag"]?.main).toEqual([
      [{ node: "Update Status to Next Gate", type: "main", index: 0 }],
    ]);
  });

  it("routes blocker tag swap before previous-gate status return", () => {
    expect(workflow.connections["POST Blocker Comment"]?.main).toEqual([
      [{ node: "Swap activity tags", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Swap activity tags"]?.main).toEqual([
      [{ node: "Add agent-blocked tag", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Add agent-blocked tag"]?.main).toEqual([
      [{ node: "Update Status to Previous Gate", type: "main", index: 0 }],
    ]);
  });

  it("blocker path chains: Detect -> Has Blocker -> Format -> POST -> Update -> Set Status", () => {
    const nodes = [
      "Detect Blocker",
      "Has Blocker?",
      "Format Blocker Comment",
      "POST Blocker Comment",
      "Swap activity tags",
      "Add agent-blocked tag",
      "Update Status to Previous Gate",
      "Status → Previous Gate",
    ];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const from = nodes[i];
      const to = nodes[i + 1];
      expect(workflowConnectionPath(workflow, from, to), `${from} -> ${to}`).not.toBeNull();
    }
  });

  it("blocker path does NOT include Replace Doc Page node", () => {
    const path = workflowConnectionPath(workflow, "Format Blocker Comment", "Replace Doc Page");
    expect(path).toBeNull();
  });

  it("blocker path returns to previous gate, not next gate", () => {
    const blocker_path = workflowConnectionPath(
      workflow,
      "Update Status to Previous Gate",
      "Status → Previous Gate"
    );
    const next_gate_path = workflowConnectionPath(
      workflow,
      "Update Status to Previous Gate",
      "Status → Next Gate"
    );
    expect(blocker_path).not.toBeNull();
    expect(next_gate_path).toBeNull();
  });

  it("pointer comment path is still available for non-blocker success cases", () => {
    const path = workflowConnectionPath(workflow, "Format Pointer Comment", "Replace Doc Page");
    expect(path).not.toBeNull();
  });

  it("tag lifecycle nodes are unreachable from removed ready and needs review paths", () => {
    expect(workflowConnectionPath(workflow, "Staged or Ready?", "Add agent-working")).toBeNull();
    expect(workflowConnectionPath(workflow, "Needs Review?", "Clear activity tags")).toBeNull();
    expect(workflowConnectionPath(workflow, "Needs Review?", "Swap activity tags")).toBeNull();
  });

  it("Agent Output OK branches to Staged Success on success", () => {
    const agentOutputNode = nodeByName(workflow, "Agent Output OK?");
    expect(agentOutputNode).toBeDefined();
    const connections = workflow.connections["Agent Output OK?"]?.main ?? [];
    expect(connections[0]?.[0]?.node).toBe("Staged Success?");
  });

  it("investigate blocker path returns to backlog (previous gate)", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    expect(code).toContain("investigate");
    expect(code).toContain("backlog");
    expect(code).toContain("Backlog");
    // Verify the mapping exists in the generated code
    expect(code).toContain("investigate");
  });

  it("write blocker path returns to brief review (previous gate)", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    expect(code).toContain("write");
    expect(code).toContain("brief review");
    expect(code).toContain("Brief Review");
  });

  it("format blocker path returns to content review (previous gate)", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    expect(code).toContain("format");
    expect(code).toContain("content review");
    expect(code).toContain("Content Review");
  });

  it("blocker topology reaches blocker comment then previous-gate status update for all stages", () => {
    const blocker_comment_path = workflowConnectionPath(
      workflow,
      "Format Blocker Comment",
      "POST Blocker Comment"
    );
    const status_update_path = workflowConnectionPath(
      workflow,
      "POST Blocker Comment",
      "Update Status to Previous Gate"
    );
    expect(blocker_comment_path).not.toBeNull();
    expect(status_update_path).not.toBeNull();
  });
});
