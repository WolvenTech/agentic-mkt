import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MODEL,
  STAGED_FORMAT_PATH_NODE_SEQUENCE,
  STAGED_INVESTIGATE_PATH_NODE_SEQUENCE,
  STAGED_WRITE_PATH_NODE_SEQUENCE,
  extractStageFromWebhook,
  fieldId,
  ingressMatchesFormat,
  ingressMatchesInvestigate,
  ingressMatchesWrite,
  loadFieldMapping,
  statusName,
  workflowConnectionPath,
} from "../../src/marketing-pipeline/logic.js";
import type { ClickUpWebhookPayload } from "../../src/marketing-pipeline/logic.js";
import type { FieldMapping } from "../../src/types/field-mapping.js";
import { loadCodeNodeSource } from "../../src/workflows/n8n-codegen.js";
import { buildMarketingPipelineWorkflow } from "../../src/workflows/build-marketing-pipeline.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const INVESTIGATE_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "integrations", "clickup", "fixtures", "task-status-updated-investigate.json");
const WRITE_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "integrations", "clickup", "fixtures", "task-status-updated-write.json");
const FORMAT_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "integrations", "clickup", "fixtures", "task-status-updated-format.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

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

describe("Marketing Pipeline stage routing", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  it("routes investigate ingress to investigative-brief agent", () => {
    const investigatePayload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesInvestigate(investigatePayload, mapping)).toBe(true);
    expect(extractStageFromWebhook(investigatePayload, mapping)).toBe("investigate");

    // Verify workflow topology includes investigate path
    expect(workflowConnectionPath(workflow, "Extract Stage", "Set Staged Ingress")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Route by Stage?", "Investigate?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Investigate?", "Add agent-working")).not.toBeNull();
  });

  it("routes write ingress to long-form-argument agent", () => {
    const writePayload = readJson<ClickUpWebhookPayload>(WRITE_WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesWrite(writePayload, mapping)).toBe(true);
    expect(extractStageFromWebhook(writePayload, mapping)).toBe("write");

    // Verify workflow topology includes write path
    expect(workflowConnectionPath(workflow, "Route by Stage?", "Write?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Write?", "Add agent-working")).not.toBeNull();
  });

  it("routes format ingress to linkedin-format agent", () => {
    const formatPayload = readJson<ClickUpWebhookPayload>(FORMAT_WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesFormat(formatPayload, mapping)).toBe(true);
    expect(extractStageFromWebhook(formatPayload, mapping)).toBe("format");

    // Verify workflow topology includes format path
    expect(workflowConnectionPath(workflow, "Route by Stage?", "Format?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Format?", "Add agent-working")).not.toBeNull();
  });

  it("investigate happy path reaches Execute Call Agent and next gate (brief review)", () => {
    for (let index = 0; index < STAGED_INVESTIGATE_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = STAGED_INVESTIGATE_PATH_NODE_SEQUENCE[index];
      const end = STAGED_INVESTIGATE_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Execute Call Agent", "Status → Next Gate")).not.toBeNull();
  });

  it("write happy path reaches Execute Call Agent and next gate (content review)", () => {
    for (let index = 0; index < STAGED_WRITE_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = STAGED_WRITE_PATH_NODE_SEQUENCE[index];
      const end = STAGED_WRITE_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Execute Call Agent", "Status → Next Gate")).not.toBeNull();
  });

  it("format happy path reaches Execute Call Agent and next gate (final review)", () => {
    for (let index = 0; index < STAGED_FORMAT_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = STAGED_FORMAT_PATH_NODE_SEQUENCE[index];
      const end = STAGED_FORMAT_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Execute Call Agent", "Status → Next Gate")).not.toBeNull();
  });

  it("staged input assembly stays linear after the activity tag update", () => {
    expect(workflow.connections["Add agent-working"]?.main).toEqual([
      [{ node: "GET Task Comments", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["GET Task Comments"]?.main).toEqual([
      [{ node: "Collect Task Comments", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Collect Task Comments"]?.main).toEqual([
      [{ node: "Has Doc URL?", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Read Current Page"]?.main).toEqual([
      [{ node: "Extract Latest Lead Feedback", type: "main", index: 0 }],
    ]);
  });

  it("routes all stages to Execute Call Agent with stage metadata", () => {
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    const stageInputCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "prepare-staged-call-agent-input",
      tokens: { DEFAULT_MODEL },
    });
    expect(stageInputCode).toContain("stage");
    expect(stageInputCode).toContain("agent_id");
  });

  // "extracts stage in task fields to set correct agent_id" (extractTaskFieldsJs) is now
  // covered end-to-end by the runtime equivalence test in tests/consistency/n8n-code-equivalence.test.ts,
  // which asserts the actual resolved agent_id per stage rather than static string content.

  it("falls back to canonical stage and agent defaults when mapping entries are missing", () => {
    const sparseMapping = {
      custom_fields: {},
      statuses: {},
    } as FieldMapping;

    const taskFieldsCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "extract-task-fields",
      tokens: {
        FIELD_ID_CRITERIOS_DE_ACEITE: fieldId(sparseMapping, "criterios_de_aceite"),
        FIELD_ID_AGENT_ID: fieldId(sparseMapping, "agent_id"),
        FIELD_ID_EDITORIAL_DOC_URL: fieldId(sparseMapping, "editorial_doc_url"),
        DEFAULT_AGENT_ID,
        DEFAULT_MODEL,
      },
    });
    const stageCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "extract-stage",
      tokens: {
        STATUS_INVESTIGATE: statusName(sparseMapping, "investigate"),
        STATUS_WRITE: statusName(sparseMapping, "write"),
        STATUS_FORMAT: statusName(sparseMapping, "format"),
      },
    });

    expect(taskFieldsCode).toContain("investigative-brief");
    expect(stageCode).toContain("stage");
    // Note: the pre-migration combined stagedIngressIfExpression() always embedded literal
    // "investigate"/"write"/"format" text regardless of mapping. The current per-stage
    // functions (stagedInvestigateIfExpression etc.) derive the compared status purely from
    // fieldMapping.statuses, so with an empty mapping the expression no longer contains those
    // words — this is real behavior change, not something to fake-assert here. See the
    // "staged ingress n8n IF expressions" describe block above for coverage with a real mapping.
  });

  it("staged success path reaches Status → Next Gate (investigate)", () => {
    expect(workflowConnectionPath(workflow, "Update Status to Next Gate", "Status → Next Gate")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "POST Pointer Comment", "Status → Next Gate")).toEqual([
      "POST Pointer Comment",
      "Clear activity tags",
      "Remove agent-blocked tag",
      "Update Status to Next Gate",
      "Status → Next Gate",
    ]);
  });

  it("staged success path replaces Doc page before posting comment", () => {
    expect(workflowConnectionPath(workflow, "Format Pointer Comment", "Replace Doc Page")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Replace Doc Page", "POST Pointer Comment")).not.toBeNull();
  });

  it("Doc/Page creation chain nodes exist with the correct node types", () => {
    expect(nodeByName(workflow, "Has Doc URL?")?.type).toBe("n8n-nodes-base.if");
    expect(nodeByName(workflow, "Use Existing Doc")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "POST Create ClickUp Doc")?.type).toBe("n8n-nodes-base.httpRequest");
    expect(nodeByName(workflow, "Doc Created")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "Persist Doc Pointer")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "PUT Update Editorial Doc Url")?.type).toBe("n8n-nodes-base.httpRequest");
    expect(nodeByName(workflow, "Doc Ready")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "GET List Doc Pages")?.type).toBe("n8n-nodes-base.httpRequest");
    expect(nodeByName(workflow, "Find Stage Page")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "Page Exists?")?.type).toBe("n8n-nodes-base.if");
    expect(nodeByName(workflow, "POST Create Doc Page")?.type).toBe("n8n-nodes-base.httpRequest");
    expect(nodeByName(workflow, "Page Created")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "Page Ready")?.type).toBe("n8n-nodes-base.noOp");
    expect(nodeByName(workflow, "GET Doc Page Content")?.type).toBe("n8n-nodes-base.httpRequest");
    expect(nodeByName(workflow, "Read Current Page")?.type).toBe("n8n-nodes-base.code");
    expect(nodeByName(workflow, "PUT Replace Doc Page Content")?.type).toBe("n8n-nodes-base.httpRequest");
    expect(nodeByName(workflow, "Replace Doc Page")?.type).toBe("n8n-nodes-base.code");
  });

  it("all Doc/Page HTTP nodes authenticate with the predefined ClickUp credential", () => {
    for (const name of [
      "POST Create ClickUp Doc",
      "PUT Update Editorial Doc Url",
      "GET List Doc Pages",
      "POST Create Doc Page",
      "GET Doc Page Content",
      "PUT Replace Doc Page Content",
    ]) {
      const node = nodeByName(workflow, name);
      expect(node?.parameters).toMatchObject({
        authentication: "predefinedCredentialType",
        nodeCredentialType: "clickUpApi",
      });
      expect(node?.credentials).toEqual({
        clickUpApi: { id: "CLICKUP_CREDENTIAL_ID", name: "ClickUp Marketing Pipeline" },
      });
    }
  });

  it("sends an explicit JSON Content-Type header for ClickUp HTTP nodes with JSON bodies", () => {
    for (const name of [
      "POST Create ClickUp Doc",
      "PUT Update Editorial Doc Url",
      "POST Create Doc Page",
      "PUT Replace Doc Page Content",
    ]) {
      const node = nodeByName(workflow, name);
      expect(node?.parameters).toMatchObject({
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: "Content-Type", value: "application/json" }],
        },
      });
    }
  });

  it("updates Editorial Doc Url through the ClickUp custom-field endpoint", () => {
    const node = nodeByName(workflow, "PUT Update Editorial Doc Url");
    expect(node?.parameters).toMatchObject({
      method: "POST",
      url: "=https://api.clickup.com/api/v2/task/{{ $json.task_id }}/field/{{ $json.editorial_doc_url_field_id }}",
      jsonBody: "={{ { value: $json.editorial_doc_url } }}",
    });
  });

  it("Has Doc URL? branches to Use Existing Doc on true, doc creation on false", () => {
    const branches = workflow.connections["Has Doc URL?"]?.main ?? [];
    expect(branches[0]?.[0]?.node).toBe("Use Existing Doc");
    expect(branches[1]?.[0]?.node).toBe("POST Create ClickUp Doc");
  });

  it("Use Existing Doc branches directly to Doc Ready, while Doc Created path persists pointer first", () => {
    expect(workflow.connections["Use Existing Doc"]?.main).toEqual([
      [{ node: "Doc Ready", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Doc Created"]?.main).toEqual([
      [{ node: "Persist Doc Pointer", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Persist Doc Pointer"]?.main).toEqual([
      [{ node: "PUT Update Editorial Doc Url", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["PUT Update Editorial Doc Url"]?.main).toEqual([
      [{ node: "Doc Ready", type: "main", index: 0 }],
    ]);
  });

  it("Doc Ready restores Doc metadata after the pointer persistence HTTP response", () => {
    const code = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "doc-ready" });
    expect(code).toContain("$('Persist Doc Pointer').first().json");
    expect(code).toContain("Doc Ready missing doc_id or workspace_id");
    expect(code).toContain("return [{ json: fields }]");
  });

  it("Page Exists? branches directly to Page Ready on true, page creation on false", () => {
    const branches = workflow.connections["Page Exists?"]?.main ?? [];
    expect(branches[0]?.[0]?.node).toBe("Page Ready");
    expect(branches[1]?.[0]?.node).toBe("POST Create Doc Page");
  });

  it("Page Exists? true branch and Page Created both converge on Page Ready", () => {
    expect(workflow.connections["Page Created"]?.main).toEqual([
      [{ node: "Page Ready", type: "main", index: 0 }],
    ]);
  });

  it("Doc/Page creation chain connects end to end from Collect Task Comments to Extract Latest Lead Feedback", () => {
    const chain = [
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
    ];
    for (let index = 0; index < chain.length - 1; index += 1) {
      const from = chain[index];
      const to = chain[index + 1];
      expect(workflowConnectionPath(workflow, from as string, to as string), `${from} -> ${to}`).not.toBeNull();
    }
    // false branches also reach the convergence points via pointer persistence
    expect(workflowConnectionPath(workflow, "Has Doc URL?", "POST Create ClickUp Doc")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "POST Create ClickUp Doc", "Doc Created")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Doc Created", "Persist Doc Pointer")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Persist Doc Pointer", "PUT Update Editorial Doc Url")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "PUT Update Editorial Doc Url", "Doc Ready")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Page Exists?", "POST Create Doc Page")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "POST Create Doc Page", "Page Ready")).not.toBeNull();
  });

  it("Doc/Page replace chain connects Format Pointer Comment through PUT to Replace Doc Page", () => {
    expect(workflow.connections["Format Pointer Comment"]?.main).toEqual([
      [{ node: "PUT Replace Doc Page Content", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["PUT Replace Doc Page Content"]?.main).toEqual([
      [{ node: "Replace Doc Page", type: "main", index: 0 }],
    ]);
  });
});
