import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMENT_SECTIONS,
  DEFAULT_TEST_BRIEF,
  EVIDENCE_PATH,
  GREEN_RUN_CHECKLIST,
  LEAD_FEEDBACK_COMMENT,
  PreflightReport,
  RUN_LOG_ROOT,
  buildEvidence,
  commentHasSections,
  executeGreenRun,
  executeRevisionGreenRun,
  fieldMappingSynced,
  linkN8nExecutionsForTask,
  main,
  runPreflight,
  shouldUpdateCanonical,
} from "../src/clickup/green-run-validation.js";
import { formatClickupComment } from "../src/marketing-pipeline/logic.js";
import type { N8nClient, N8nExecution } from "../src/n8n/client.js";
import type { FieldMapping } from "../src/types/field-mapping.js";

function listRunDirs(): Set<string> {
  try {
    return new Set(readdirSync(RUN_LOG_ROOT));
  } catch {
    return new Set();
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let tmpDir: string | undefined;

function writeTempFieldMapping(mapping: FieldMapping): string {
  tmpDir = mkdtempSync(join(tmpdir(), "agentic-mkt-green-run-"));
  const path = join(tmpDir, "field-mapping.json");
  writeFileSync(path, JSON.stringify(mapping), "utf-8");
  return path;
}

let createdEvidencePath = false;

/** EVIDENCE_PATH is gitignored (never committed) — seed a baseline locally if it doesn't exist yet. */
function ensureBaselineEvidence(): string {
  try {
    return readFileSync(EVIDENCE_PATH, "utf-8");
  } catch {
    const baseline = JSON.stringify(
      {
        recorded_at: "2026-01-01",
        session: "test-baseline",
        validation_status: "blocked",
        preflight: { checklist: [], coverage_percent: 0, blockers: [] },
        main_workflow: {
          verified: false,
          n8n_execution_id: "",
          n8n_host: "",
          clickup_task_id: "",
          clickup_task_url: "",
          clickup_task_name: "",
          status_path: [],
          latency_seconds: null,
          latency_breakdown: {},
          comment_sections_verified: [],
          marketing_lead_usability: "",
          silent_failures: null,
        },
        call_agent_subworkflow: {},
        failure_observations: {},
      },
      null,
      2
    );
    writeFileSync(EVIDENCE_PATH, baseline, "utf-8");
    createdEvidencePath = true;
    return baseline;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
  if (createdEvidencePath) {
    rmSync(EVIDENCE_PATH, { force: true });
    createdEvidencePath = false;
  }
});

describe("GREEN_RUN_CHECKLIST", () => {
  it("includes the required infra and runtime steps", () => {
    const required = [
      "field_mapping_synced",
      "clickup_custom_fields_present",
      "n8n_main_workflow_active",
      "comment_has_three_sections",
      "latency_under_60s",
      "final_status_review",
      "n8n_execution_success",
      "marketing_lead_usability",
      "revision_draft_posted",
      "revision_latency_under_60s",
    ];
    for (const step of required) {
      expect(GREEN_RUN_CHECKLIST).toContain(step);
    }
  });

  it("comment_has_sections matches the io-contract comment formatter", () => {
    const comment = formatClickupComment({
      deliverable_markdown: "Draft body",
      resumo: "Short summary",
      autochecagem: "- Criterion met",
    });
    expect(commentHasSections(comment)).toBe(true);
    expect(COMMENT_SECTIONS.every((section) => comment.includes(section))).toBe(true);
  });

  it("DEFAULT_TEST_BRIEF has a title, description, and acceptance criteria", () => {
    expect(DEFAULT_TEST_BRIEF.name).toBeTruthy();
    expect(DEFAULT_TEST_BRIEF.description).toBeTruthy();
    expect(DEFAULT_TEST_BRIEF.criterios_de_aceite).toBeTruthy();
  });
});

describe("fieldMappingSynced", () => {
  it("reports 0% coverage for an empty preflight report", () => {
    expect(new PreflightReport().coveragePercent).toBe(0);
  });

  it("fails when clickup_list_id is <TBD>", () => {
    const mapping: FieldMapping = {
      clickup_list_id: "<TBD>",
      custom_fields: {
        criterios_de_aceite: { name: "ACs", type: "text", clickup_field_id: "123" },
      },
      statuses: { ready: "Ready" },
    };
    const result = fieldMappingSynced(mapping);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("clickup_list_id is unset");
  });

  it("fails when a custom field clickup_field_id is <TBD>", () => {
    const mapping: FieldMapping = {
      clickup_list_id: "901234567",
      custom_fields: {
        agent_id: { name: "Agent", type: "short_text", clickup_field_id: "<TBD>" },
      },
      statuses: {},
    };
    const result = fieldMappingSynced(mapping);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("agent_id");
  });

  it("passes when list ID and all custom field IDs are set", () => {
    const mapping: FieldMapping = {
      clickup_list_id: "901234567",
      custom_fields: {
        agent_id: { name: "Agent", type: "short_text", clickup_field_id: "cf1" },
      },
      statuses: {},
    };
    const result = fieldMappingSynced(mapping);
    expect(result.passed).toBe(true);
  });
});

describe("buildEvidence", () => {
  it("produces validation_status 'blocked' with required top-level keys when preflight has blockers", () => {
    const report = new PreflightReport();
    report.results.push({ step: "field_mapping_synced", passed: false, detail: "clickup_list_id is unset" });
    const evidence = buildEvidence(report, undefined, { SKIP_DOTENV: "1" });

    for (const key of ["recorded_at", "session", "validation_status", "preflight", "main_workflow", "failure_observations"]) {
      expect(evidence).toHaveProperty(key);
    }
    expect(evidence.validation_status).toBe("blocked");
    expect(Array.isArray(evidence.preflight.checklist)).toBe(true);
    expect(evidence.preflight.checklist.length).toBeGreaterThan(0);
  });

  it("appends skipped runtime steps to the checklist when not verified", () => {
    const report = new PreflightReport();
    for (let i = 0; i < 7; i++) {
      report.results.push({ step: `step_${i}`, passed: true, detail: "ok" });
    }
    const evidence = buildEvidence(report, undefined, { SKIP_DOTENV: "1" });
    expect(evidence.validation_status).toBe("ready");
    const steps = evidence.preflight.checklist.map((c) => c.step);
    expect(steps).toContain("comment_has_three_sections");
    expect(evidence.preflight.checklist.find((c) => c.step === "comment_has_three_sections")?.status).toBe("skip");
  });

  it("sets validation_status 'passed' and omits skip entries when the main workflow is verified", () => {
    const report = new PreflightReport();
    report.results.push({ step: "field_mapping_synced", passed: true, detail: "ok" });
    const evidence = buildEvidence(
      report,
      { verified: true, latency_seconds: 12.3, final_status_review: true, marketing_lead_usability: "great" },
      { SKIP_DOTENV: "1" }
    );
    expect(evidence.validation_status).toBe("passed");
    expect(evidence.preflight.checklist.some((c) => c.status === "skip")).toBe(false);
  });
});

describe("shouldUpdateCanonical", () => {
  it("is false by default and true for truthy values", () => {
    expect(shouldUpdateCanonical({})).toBe(false);
    expect(shouldUpdateCanonical({ GREEN_RUN_UPDATE_CANONICAL: "1" })).toBe(true);
    expect(shouldUpdateCanonical({ GREEN_RUN_UPDATE_CANONICAL: "true" })).toBe(true);
    expect(shouldUpdateCanonical({ GREEN_RUN_UPDATE_CANONICAL: "0" })).toBe(false);
  });
});

function fullFieldMapping(overrides: Partial<FieldMapping> = {}): FieldMapping {
  return {
    list_name: "Linkedin Post Creator",
    clickup_list_id: "901234567",
    custom_fields: {
      criterios_de_aceite: { name: "ACs", type: "text", clickup_field_id: "cf1" },
      agent_id: { name: "Agent", type: "short_text", clickup_field_id: "cf2", default: "investigative-brief" },
      editorial_doc_url: { name: "Editorial Doc Url", type: "url", clickup_field_id: "cf3" },
    },
    statuses: {
      backlog: "Backlog",
      investigate: "Investigate",
      brief_review: "Brief Review",
      write: "Write",
      content_review: "Content Review",
      format: "Format",
      final_review: "Final Review",
      ready: "Ready",
      needs_review: "Needs Review",
      writing: "Writing",
      review: "Approval",
      publish: "Publish",
      completed: "Closed",
    },
    ...overrides,
  };
}

const PREFLIGHT_ARGS = {
  clickupToken: "pk_test",
  clickupListId: "901234567",
  n8nApiUrl: "https://n8n.example.test",
  n8nApiKey: "n8n_test_key",
};

function stubClickUpAndN8nSuccess(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("api.clickup.com")) {
        if (url.includes("/field")) {
          return jsonResponse({
            fields: [{ name: "ACs" }, { name: "Agent" }, { name: "Editorial Doc Url" }],
          });
        }
        return jsonResponse({
          name: "Linkedin Post Creator",
          statuses: [
            { status: "Backlog" },
            { status: "Investigate" },
            { status: "Brief Review" },
            { status: "Write" },
            { status: "Content Review" },
            { status: "Format" },
            { status: "Final Review" },
            { status: "Ready" },
            { status: "Needs Review" },
            { status: "Writing" },
            { status: "Approval" },
            { status: "Publish" },
            { status: "Closed" },
          ],
        });
      }
      return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
    })
  );
}

describe("runPreflight (mocked ClickUp + n8n)", () => {
  it("returns 7 passing results when everything is configured and reachable", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    stubClickUpAndN8nSuccess();

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    expect(report.results).toHaveLength(7);
    expect(report.blockers).toEqual([]);
    expect(report.coveragePercent).toBe(100);
  });

  it("fails clickup_list_configured with the HTTP status on a 401, but still runs the other checks", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }] });
          }
          if (url.endsWith("/list/901234567")) {
            return jsonResponse({ err: "Unauthorized" }, 401);
          }
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const listCheck = report.results.find((r) => r.step === "clickup_list_configured");
    expect(listCheck?.passed).toBe(false);
    expect(listCheck?.detail).toContain("HTTP 401");
    expect(report.results.find((r) => r.step === "clickup_custom_fields_present")?.passed).toBe(true);
  });

  it("fails clickup_list_configured when the live list name does not match field-mapping.json", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }] });
          }
          return jsonResponse({ name: "Some Other List", statuses: [] });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const listCheck = report.results.find((r) => r.step === "clickup_list_configured");
    expect(listCheck?.passed).toBe(false);
    expect(listCheck?.detail).toContain("Some Other List");
  });

  it("fails clickup_custom_fields_present when a required field is missing", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "Agent" }] });
          }
          return jsonResponse({
            name: "Linkedin Post Creator",
            statuses: [{ status: "Ready" }, { status: "Needs Review" }, { status: "Writing" }, { status: "Approval" }],
          });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const fieldsCheck = report.results.find((r) => r.step === "clickup_custom_fields_present");
    expect(fieldsCheck?.passed).toBe(false);
    expect(fieldsCheck?.detail).toContain("ACs");
  });

  it("fails clickup_statuses_present when a required status is missing on the list", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }] });
          }
          return jsonResponse({ name: "Linkedin Post Creator", statuses: [{ status: "Ready" }] });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const statusesCheck = report.results.find((r) => r.step === "clickup_statuses_present");
    expect(statusesCheck?.passed).toBe(false);
    expect(statusesCheck?.detail).toContain("Writing");
  });

  it("fails clickup_statuses_present when the live list is missing Needs Review", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }] });
          }
          return jsonResponse({
            name: "Linkedin Post Creator",
            statuses: [{ status: "Ready" }, { status: "Writing" }, { status: "Approval" }],
          });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const statusesCheck = report.results.find((r) => r.step === "clickup_statuses_present");
    expect(statusesCheck?.passed).toBe(false);
    expect(statusesCheck?.detail).toContain("Needs Review");
  });

  it("passes clickup_statuses_present when all automation statuses including Needs Review are present", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    stubClickUpAndN8nSuccess();

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const statusesCheck = report.results.find((r) => r.step === "clickup_statuses_present");
    expect(statusesCheck?.passed).toBe(true);
    expect(statusesCheck?.detail).toContain("Needs Review");
  });

  it("matches ClickUp statuses case-insensitively during preflight", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "Editorial Doc Url" }] });
          }
          return jsonResponse({
            name: "Linkedin Post Creator",
            statuses: [
              { status: "backlog" },
              { status: "investigate" },
              { status: "brief review" },
              { status: "write" },
              { status: "content review" },
              { status: "format" },
              { status: "final review" },
              { status: "ready" },
              { status: "needs review" },
              { status: "writing" },
              { status: "approval" },
              { status: "publish" },
              { status: "closed" },
            ],
          });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    expect(report.results.find((r) => r.step === "clickup_statuses_present")?.passed).toBe(true);
  });

  it("fails clickup_statuses_present when field-mapping.json is missing needs_review", async () => {
    const { needs_review: _needsReview, ...statuses } = fullFieldMapping().statuses;
    const path = writeTempFieldMapping(fullFieldMapping({ statuses }));
    stubClickUpAndN8nSuccess();

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const statusesCheck = report.results.find((r) => r.step === "clickup_statuses_present");
    expect(statusesCheck?.passed).toBe(false);
    expect(statusesCheck?.detail).toContain("needs_review");
  });

  it("fails all three n8n checks with the same error detail when the n8n API is unreachable", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }] });
          }
          return jsonResponse({
            name: "Linkedin Post Creator",
            statuses: [{ status: "Ready" }, { status: "Needs Review" }, { status: "Writing" }, { status: "Approval" }],
          });
        }
        return jsonResponse({ err: "Unauthorized" }, 401);
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    expect(report.results.find((r) => r.step === "n8n_call_agent_workflow_present")?.passed).toBe(false);
    expect(report.results.find((r) => r.step === "n8n_main_workflow_present")?.passed).toBe(false);
    expect(report.results.find((r) => r.step === "n8n_main_workflow_active")?.passed).toBe(false);
  });

  it("fails n8n_main_workflow_active when the Marketing Pipeline workflow is imported but not active", async () => {
    const path = writeTempFieldMapping(fullFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }] });
          }
          return jsonResponse({
            name: "Linkedin Post Creator",
            statuses: [{ status: "Ready" }, { status: "Needs Review" }, { status: "Writing" }, { status: "Approval" }],
          });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: false }] });
      })
    );

    const report = await runPreflight({ ...PREFLIGHT_ARGS, fieldMappingPath: path });
    const activeCheck = report.results.find((r) => r.step === "n8n_main_workflow_active");
    expect(activeCheck?.passed).toBe(false);
    expect(activeCheck?.detail).toContain("Activate Marketing Pipeline");
  });

  it("skips the three ClickUp list checks with a placeholder detail when the list ID is unset", async () => {
    const path = writeTempFieldMapping(fullFieldMapping({ clickup_list_id: "<TBD>" }));
    stubClickUpAndN8nSuccess();

    const report = await runPreflight({ ...PREFLIGHT_ARGS, clickupListId: "", fieldMappingPath: path });
    expect(report.results.find((r) => r.step === "clickup_list_configured")?.detail).toContain("unset");
    expect(report.results.find((r) => r.step === "clickup_custom_fields_present")?.detail).toContain("Skipped");
    expect(report.results.find((r) => r.step === "clickup_statuses_present")?.detail).toContain("Skipped");
    expect(report.results.find((r) => r.step === "field_mapping_synced")?.passed).toBe(false);
  });
});

describe("executeGreenRun (mocked ClickUp)", () => {
  function stubExecuteFlow(options: { commentReady?: boolean; reachesReview?: boolean } = {}): ReturnType<typeof vi.fn> {
    const { commentReady = true, reachesReview = true } = options;
    let getTaskCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && url.endsWith("/task")) {
        return jsonResponse({ id: "86btest01", url: "https://app.clickup.com/t/86btest01" });
      }
      if (method === "POST" && url.includes("/field/")) {
        return jsonResponse({});
      }
      if (method === "PUT" && url.endsWith("/task/86btest01")) {
        return jsonResponse({});
      }
      if (method === "GET" && url.endsWith("/task/86btest01")) {
        getTaskCalls += 1;
        const status = reachesReview && getTaskCalls > 1 ? "Approval" : "Writing";
        return jsonResponse({ status: { status } });
      }
      if (method === "GET" && url.endsWith("/comment")) {
        const text = commentReady
          ? formatClickupComment({ deliverable_markdown: "Draft", resumo: "Summary", autochecagem: "Checked" })
          : "no sections here";
        return jsonResponse({ comments: [{ comment_text: text }] });
      }
      if (method === "DELETE" && url.endsWith("/task/86btest01")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("runs the happy path: creates a task, walks to Review, finds the formatted comment, then deletes the task", async () => {
    const fetchMock = stubExecuteFlow();

    const result = await executeGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
    });

    expect(result.verified).toBe(true);
    expect(result.clickup_task_id).toBe("86btest01");
    expect(result.final_status_review).toBe(true);
    expect(result.comment_sections_verified).toEqual([...COMMENT_SECTIONS]);
    expect(result.silent_failures).toBe(0);
    expect(result.brief_complete).toBe(true);
    expect(result.latency_under_60s).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
  });

  it("skips deleting the task when GREEN_RUN_KEEP_TASK=1", async () => {
    const fetchMock = stubExecuteFlow();

    await executeGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
      env: { GREEN_RUN_KEEP_TASK: "1" },
    });

    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(false);
  });

  it("reports silent_failures=1 and final_status_review=false when the deadline elapses before Review", async () => {
    stubExecuteFlow({ commentReady: false, reachesReview: false });

    const result = await executeGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
      deadlineMs: 5,
    });

    expect(result.final_status_review).toBe(false);
    expect(result.silent_failures).toBe(1);
    expect(result.comment_sections_verified).toEqual([]);
  });

  it("throws when field-mapping.json is missing a required custom field or status key for the execute path", async () => {
    const mapping = fullFieldMapping({ statuses: {} });
    await expect(executeGreenRun("pk_test", mapping)).rejects.toThrow(/missing expected/);
  });

  it("auto-links n8n execution evidence after ClickUp polling succeeds", async () => {
    stubExecuteFlow();
    const windowStart = Date.parse("2026-06-22T12:00:00.000Z");
    const fullExecution: N8nExecution = {
      id: "1254",
      status: "success",
      startedAt: "2026-06-22T12:00:01.000Z",
      stoppedAt: "2026-06-22T12:00:08.400Z",
      data: {
        resultData: {
          runData: {
            "ClickUp Webhook": [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          task_id: "86btest01",
                          history_items: [
                            {
                              field: "status",
                              before: { status: "backlog" },
                              after: { status: "ready" },
                            },
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
            "Extract Webhook Context": [{ executionTime: 5 }],
            "GET ClickUp Task": [{ executionTime: 120 }],
            "Execute Call Agent": [{ executionTime: 4400 }],
          },
        },
      },
    };
    const filteredExecution: N8nExecution = {
      id: "1256",
      status: "success",
      startedAt: "2026-06-22T12:00:09.000Z",
      stoppedAt: "2026-06-22T12:00:09.007Z",
      data: {
        resultData: {
          runData: {
            "ClickUp Webhook": [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          task_id: "86btest01",
                          history_items: [
                            {
                              field: "status",
                              before: { status: "ready" },
                              after: { status: "writing" },
                            },
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
            "Ignore Non-Matching Webhook": [{ executionTime: 1 }],
          },
        },
      },
    };
    const n8nClient: N8nClient = {
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-main", name: "Marketing Pipeline", active: true }]),
      listExecutions: vi.fn().mockResolvedValue([
        { id: "1254", startedAt: fullExecution.startedAt },
        { id: "1256", startedAt: filteredExecution.startedAt },
        { id: "1250", startedAt: "2026-06-22T11:59:00.000Z" },
      ]),
      getExecution: vi.fn(async (id: string) => {
        if (id === "1254") return fullExecution;
        if (id === "1256") return filteredExecution;
        throw new Error(`unexpected execution ${id}`);
      }),
    };

    const result = await executeGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
      n8nClient,
      n8nLinkWindowStartMs: windowStart,
      env: { N8N_API_KEY: "n8n_test_key" },
    });

    expect(result.n8n_execution_id).toBe("1254");
    expect(result.n8n_execution_success).toBe(true);
    expect(result.filtered_execution_count).toBe(1);
    expect(n8nClient.listExecutions).toHaveBeenCalledWith({ workflowId: "wf-main", limit: 50 });
  });

  it("falls back to GREEN_RUN_N8N_EXECUTION_ID when auto-link finds no ingress execution", async () => {
    stubExecuteFlow();
    const n8nClient: N8nClient = {
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-main", name: "Marketing Pipeline", active: true }]),
      listExecutions: vi.fn().mockResolvedValue([]),
      getExecution: vi.fn(),
    };

    const result = await executeGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
      n8nClient,
      n8nLinkWindowStartMs: Date.parse("2026-06-22T12:00:00.000Z"),
      env: { N8N_API_KEY: "n8n_test_key", GREEN_RUN_N8N_EXECUTION_ID: "9999" },
    });

    expect(result.n8n_execution_id).toBe("9999");
    expect(result.n8n_execution_success).toBe(false);
    expect(result.filtered_execution_count).toBe(0);
  });

  it("uses GREEN_RUN_N8N_EXECUTION_ID when N8N_API_KEY is unset and no client is injected", async () => {
    stubExecuteFlow();

    const result = await executeGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
      env: { GREEN_RUN_N8N_EXECUTION_ID: "manual-42" },
    });

    expect(result.n8n_execution_id).toBe("manual-42");
    expect(result.n8n_execution_success).toBe(false);
    expect(result.filtered_execution_count).toBe(0);
  });
});

describe("executeRevisionGreenRun (mocked ClickUp)", () => {
  function firstDraftComment(): string {
    return formatClickupComment({ deliverable_markdown: "Draft v1", resumo: "Summary v1", autochecagem: "Checked v1" });
  }

  function revisedDraftComment(): string {
    return formatClickupComment({ deliverable_markdown: "Draft v2", resumo: "Summary v2", autochecagem: "Checked v2" });
  }

  function stubRevisionFlow(): ReturnType<typeof vi.fn> {
    let taskCallCount = 0;
    let revisionTriggered = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && url.endsWith("/task")) {
        return jsonResponse({ id: "86btest01", url: "https://app.clickup.com/t/86btest01" });
      }
      if (method === "POST" && url.includes("/field/")) {
        return jsonResponse({});
      }
      if (method === "POST" && url.endsWith("/comment")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.comment_text === LEAD_FEEDBACK_COMMENT) {
          revisionTriggered = true;
        }
        return jsonResponse({});
      }
      if (method === "PUT" && url.endsWith("/task/86btest01")) {
        return jsonResponse({});
      }
      if (method === "GET" && url.endsWith("/task/86btest01")) {
        taskCallCount += 1;
        const statuses = ["Writing", "Approval", "Writing", "Approval"];
        const status = statuses[Math.min(taskCallCount, statuses.length) - 1];
        return jsonResponse({ status: { status } });
      }
      if (method === "GET" && url.endsWith("/comment")) {
        if (!revisionTriggered) {
          return jsonResponse({ comments: [{ comment_text: firstDraftComment() }] });
        }
        return jsonResponse({
          comments: [
            { comment_text: firstDraftComment() },
            { comment_text: LEAD_FEEDBACK_COMMENT },
            { comment_text: revisedDraftComment() },
          ],
        });
      }
      if (method === "DELETE" && url.endsWith("/task/86btest01")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("walks Approval → Needs Review → Writing → Approval and posts a revised draft", async () => {
    const fetchMock = stubRevisionFlow();

    const result = await executeRevisionGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
    });

    expect(result.verified).toBe(true);
    expect(result.clickup_task_id).toBe("86btest01");
    expect(result.final_status_approval).toBe(true);
    expect(result.revision_draft_posted).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
  });

  it("detects Writing status within 5s of the Needs Review trigger", async () => {
    stubRevisionFlow();

    const result = await executeRevisionGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
    });

    expect(result.revision_in_progress_within_5s).toBe(true);
  });

  it("passes comment_has_three_sections for the revised draft comment", async () => {
    stubRevisionFlow();

    const result = await executeRevisionGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
    });

    expect(result.revision_draft_posted).toBe(true);
    expect(result.revision_comment_sections_verified).toEqual([...COMMENT_SECTIONS]);
    expect(commentHasSections(revisedDraftComment())).toBe(true);
  });

  it("meets the PRD revision latency target (p95 < 60s)", async () => {
    stubRevisionFlow();

    const result = await executeRevisionGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
    });

    expect(result.revision_latency_under_60s).toBe(true);
  });

  it("throws when field-mapping.json is missing expected keys for the revision execute path", async () => {
    const mapping = fullFieldMapping({ statuses: {} });
    await expect(executeRevisionGreenRun("pk_test", mapping)).rejects.toThrow(/missing expected/);
  });

  it("reports verified=false and cleans up without attempting a revision when the first-draft phase never reaches Approval", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && url.endsWith("/task")) {
        return jsonResponse({ id: "86btest01", url: "https://app.clickup.com/t/86btest01" });
      }
      if (method === "POST" && url.includes("/field/")) {
        return jsonResponse({});
      }
      if (method === "PUT" && url.endsWith("/task/86btest01")) {
        return jsonResponse({});
      }
      if (method === "GET" && url.endsWith("/task/86btest01")) {
        return jsonResponse({ status: { status: "Writing" } });
      }
      if (method === "GET" && url.endsWith("/comment")) {
        return jsonResponse({ comments: [] });
      }
      if (method === "DELETE" && url.endsWith("/task/86btest01")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeRevisionGreenRun("pk_test", fullFieldMapping(), {
      sleep: async () => undefined,
      pollIntervalMs: 0,
      deadlineMs: 5,
    });

    expect(result.verified).toBe(false);
    expect(result.clickup_task_id).toBe("86btest01");
    expect(result.revision_draft_posted).toBeUndefined();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => (init as RequestInit | undefined)?.method === "POST" && String(url).endsWith("/comment"))).toBe(
      false
    );
  });
});

describe("buildEvidence — revision evidence", () => {
  it("includes revision_round only when supplied", () => {
    const report = new PreflightReport();
    report.results.push({ step: "field_mapping_synced", passed: true, detail: "ok" });

    const withoutRevision = buildEvidence(report, undefined, { SKIP_DOTENV: "1" });
    expect(withoutRevision).not.toHaveProperty("revision_round");

    const withRevision = buildEvidence(
      report,
      undefined,
      { SKIP_DOTENV: "1" },
      {
        revisionRound: { verified: true, revision_draft_posted: true },
      }
    );
    expect(withRevision.revision_round).toEqual({ verified: true, revision_draft_posted: true });
    expect(withRevision).not.toHaveProperty("cap_reset");
  });
});

describe("linkN8nExecutionsForTask (mocked n8n client)", () => {
  it("returns ingress execution id, success flag, and filtered count for the task", async () => {
    const windowStart = Date.parse("2026-06-22T12:00:00.000Z");
    const fullExecution: N8nExecution = {
      id: "1254",
      status: "success",
      startedAt: "2026-06-22T12:00:01.000Z",
      data: {
        resultData: {
          runData: {
            "ClickUp Webhook": [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          task_id: "86aj66hkb",
                          history_items: [
                            {
                              field: "status",
                              before: { status: "backlog" },
                              after: { status: "ready" },
                            },
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
            "Extract Webhook Context": [{ executionTime: 1 }],
            "GET ClickUp Task": [{ executionTime: 1 }],
          },
        },
      },
    };
    const filteredExecution: N8nExecution = {
      id: "1256",
      status: "success",
      startedAt: "2026-06-22T12:00:02.000Z",
      data: {
        resultData: {
          runData: {
            "ClickUp Webhook": [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          task_id: "86aj66hkb",
                          history_items: [
                            {
                              field: "status",
                              before: { status: "ready" },
                              after: { status: "writing" },
                            },
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
            "Ignore Non-Matching Webhook": [{ executionTime: 1 }],
          },
        },
      },
    };
    const n8nClient: N8nClient = {
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-main", name: "Marketing Pipeline" }]),
      listExecutions: vi.fn().mockResolvedValue([
        { id: "1254", startedAt: fullExecution.startedAt },
        { id: "1256", startedAt: filteredExecution.startedAt },
      ]),
      getExecution: vi.fn(async (id: string) => {
        if (id === "1254") return fullExecution;
        if (id === "1256") return filteredExecution;
        throw new Error(`unexpected execution ${id}`);
      }),
    };

    const linked = await linkN8nExecutionsForTask(n8nClient, "86aj66hkb", windowStart);
    expect(linked).toEqual({
      n8n_execution_id: "1254",
      n8n_execution_success: true,
      filtered_execution_count: 1,
    });
  });

  it("reports n8n_execution_success=false for an error ingress execution", async () => {
    const windowStart = Date.parse("2026-06-22T12:00:00.000Z");
    const errorExecution: N8nExecution = {
      id: "1250",
      status: "error",
      startedAt: "2026-06-22T12:00:01.000Z",
      data: {
        resultData: {
          error: { node: { name: "POST Task Comment" }, message: "404" },
          runData: {
            "ClickUp Webhook": [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          task_id: "86aj66hhg",
                          history_items: [
                            {
                              field: "status",
                              before: { status: "backlog" },
                              after: { status: "ready" },
                            },
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
            "Extract Webhook Context": [{ executionTime: 1 }],
            "GET ClickUp Task": [{ executionTime: 1 }],
            "POST Task Comment": [{ executionTime: 1, error: { message: "404" } }],
          },
        },
      },
    };
    const n8nClient: N8nClient = {
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-main", name: "Marketing Pipeline" }]),
      listExecutions: vi.fn().mockResolvedValue([{ id: "1250", startedAt: errorExecution.startedAt }]),
      getExecution: vi.fn().mockResolvedValue(errorExecution),
    };

    const linked = await linkN8nExecutionsForTask(n8nClient, "86aj66hhg", windowStart);
    expect(linked.n8n_execution_id).toBe("1250");
    expect(linked.n8n_execution_success).toBe(false);
    expect(linked.filtered_execution_count).toBe(0);
  });
});

describe("main() — token present, real (unsynced) field-mapping.json blocks preflight", () => {
  it("exits 2, prints the preflight checklist and blockers, and writes evidence without touching canonical (no GREEN_RUN_UPDATE_CANONICAL)", async () => {
    const beforeCanonical = ensureBaselineEvidence();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline", active: true }] }))
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await main({
      SKIP_DOTENV: "1",
      CLICKUP_API_TOKEN: "pk_test",
      CLICKUP_LIST_ID: "",
      N8N_API_KEY: "n8n_test_key",
    });

    expect(code).toBe(2);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Preflight coverage:");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Blockers:");

    const afterCanonical = readFileSync(EVIDENCE_PATH, "utf-8");
    expect(afterCanonical).toBe(beforeCanonical);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("main() — ready/unverified green run", () => {
  it("exits 3, prints skipped runtime phases, and points at GREEN_RUN_EXECUTE=1 pnpm green-run", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubClickUpAndN8nSuccess();

    const code = await main({
      SKIP_DOTENV: "1",
      CLICKUP_API_TOKEN: "pk_test",
      CLICKUP_LIST_ID: "901234567",
    });

    expect(code).toBe(3);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Ready but unverified:");
    expect(errorOutput).toContain("Skipped runtime phases: test_task_brief_complete");
    expect(errorOutput).toContain("GREEN_RUN_EXECUTE=1 pnpm green-run");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Validation status: ready");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("main() — offline (no CLICKUP_API_TOKEN)", () => {
  it("exits 2, writes logs/green-run/<timestamp>/evidence.json, and leaves canonical evidence untouched", async () => {
    const beforeCanonical = ensureBaselineEvidence();
    const beforeDirs = listRunDirs();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await main({ SKIP_DOTENV: "1" });

    expect(code).toBe(2);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Set CLICKUP_API_TOKEN");

    const afterCanonical = readFileSync(EVIDENCE_PATH, "utf-8");
    expect(afterCanonical).toBe(beforeCanonical);

    const afterDirs = listRunDirs();
    const newDirs = [...afterDirs].filter((d) => !beforeDirs.has(d));
    expect(newDirs.length).toBeGreaterThan(0);

    const latest = newDirs.sort().at(-1);
    const evidencePath = resolve(RUN_LOG_ROOT, latest as string, "evidence.json");
    const data = JSON.parse(readFileSync(evidencePath, "utf-8"));
    expect(data).toHaveProperty("preflight");
    expect(data).toHaveProperty("validation_status");
    expect(Array.isArray(data.preflight.checklist)).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not update canonical evidence on the token-missing path even with GREEN_RUN_UPDATE_CANONICAL=1 (that branch returns before promotion logic runs)", async () => {
    const beforeCanonical = ensureBaselineEvidence();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await main({ SKIP_DOTENV: "1", GREEN_RUN_UPDATE_CANONICAL: "1" });
    expect(code).toBe(2);

    const afterCanonical = readFileSync(EVIDENCE_PATH, "utf-8");
    expect(afterCanonical).toBe(beforeCanonical);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("scripts/green-run.ts wrapper", () => {
  it("propagates the ready/unverified exit code from the CLI entrypoint", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "agentic-mkt-green-run-wrapper-"));
    const preloadPath = join(tmp, "preload.cjs");
    writeFileSync(
      preloadPath,
      [
        "global.fetch = async (url, init = {}) => {",
        "  const method = init.method || 'GET';",
        "  const href = String(url);",
        "  if (href.includes('api.clickup.com')) {",
        "    if (method === 'GET' && href.includes('/field')) {",
        "      return new Response(JSON.stringify({ fields: [{ name: 'ACs' }, { name: 'Agent' }, { name: 'Editorial Doc Url' }] }), { status: 200, headers: { 'content-type': 'application/json' } });",
        "    }",
        "    if (method === 'GET' && /\\/list\\/[^/]+$/.test(href)) {",
        "      return new Response(JSON.stringify({ name: 'Linkedin Post Creator', statuses: [",
        "        { status: 'Backlog' },",
        "        { status: 'Investigate' },",
        "        { status: 'Brief Review' },",
        "        { status: 'Write' },",
        "        { status: 'Content Review' },",
        "        { status: 'Format' },",
        "        { status: 'Final Review' },",
        "        { status: 'Ready' },",
        "        { status: 'Needs Review' },",
        "        { status: 'Writing' },",
        "        { status: 'Approval' },",
        "        { status: 'Publish' },",
        "        { status: 'Closed' },",
        "      ] }), { status: 200, headers: { 'content-type': 'application/json' } });",
        "    }",
        "  }",
        "  if (href.includes('n8n')) {",
        "    return new Response(JSON.stringify({ data: [{ name: 'Call Agent' }, { name: 'Marketing Pipeline', active: true }] }), { status: 200, headers: { 'content-type': 'application/json' } });",
        "  }",
        "  throw new Error(`unexpected request ${method} ${href}`);",
        "};",
      ].join("\n"),
      "utf-8"
    );

    try {
      const result = spawnSync("pnpm", ["exec", "tsx", "scripts/green-run.ts"], {
        cwd: resolve("."),
        env: {
          ...process.env,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preloadPath}`.trim(),
          SKIP_DOTENV: "1",
          CLICKUP_API_TOKEN: "pk_test",
          CLICKUP_LIST_ID: "901234567",
        },
        encoding: "utf-8",
      });

      expect(result.status).toBe(3);
      expect(result.stderr).toContain("Ready but unverified:");
      expect(result.stderr).toContain("GREEN_RUN_EXECUTE=1 pnpm green-run");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("module boundary", () => {
  it("exposes a stable import surface for scripts/green-run.ts (task 10) to depend on", async () => {
    const moduleExports = await import("../src/clickup/green-run-validation.js");
    expect(typeof moduleExports.main).toBe("function");
    expect(typeof moduleExports.runPreflight).toBe("function");
    expect(typeof moduleExports.buildEvidence).toBe("function");
    expect(typeof moduleExports.writeRunEvidence).toBe("function");
    expect(typeof moduleExports.executeGreenRun).toBe("function");
    expect(typeof moduleExports.executeRevisionGreenRun).toBe("function");
    expect(typeof moduleExports.linkN8nExecutionsForTask).toBe("function");
  });
});
