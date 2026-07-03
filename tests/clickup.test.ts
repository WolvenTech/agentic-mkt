import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractStageFromWebhook, loadFieldMapping } from "../src/marketing-pipeline/logic.js";
import { MissingCustomFieldsError, main as syncMain, syncFieldMapping } from "../src/clickup/sync-field-mapping.js";
import { automationStatusDisplayName } from "../src/types/field-mapping.js";
import type { FieldMapping } from "../src/types/field-mapping.js";
import { main as verifyMain, verify } from "../src/clickup/verify-api.js";

const REPO_ROOT = resolve(__dirname, "..");
const FIXTURES_DIR = resolve(REPO_ROOT, "clickup", "fixtures");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf-8")) as T;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let tmpDir: string | undefined;

function writeTempFieldMapping(mapping: FieldMapping): string {
  tmpDir = mkdtempSync(join(tmpdir(), "agentic-mkt-clickup-"));
  const path = join(tmpDir, "field-mapping.json");
  writeFileSync(path, `${JSON.stringify(mapping, null, 2)}\n`, "utf-8");
  return path;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe("syncFieldMapping", () => {
  it("updates custom_fields.*.clickup_field_id and clickup_list_id from mocked list + field responses", async () => {
    const listDetail = loadFixture("list-detail-response.json");
    const listFields = loadFixture("list-fields-response.json");
    const tmpPath = writeTempFieldMapping(loadFieldMapping());

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/field")) {
          return jsonResponse(listFields);
        }
        return jsonResponse(listDetail);
      })
    );

    const result = await syncFieldMapping("pk_test_token", "901234567", { fieldMappingPath: tmpPath });

    expect(result.clickup_list_id).toBe("901234567");
    expect(result.custom_fields.criterios_de_aceite?.clickup_field_id).toBe("cf_criterios_001");
    expect(result.custom_fields.agent_id?.clickup_field_id).toBe("cf_agent_id_001");
    expect(result.custom_fields).not.toHaveProperty("revision_count");

    const written = JSON.parse(readFileSync(tmpPath, "utf-8")) as FieldMapping;
    expect(written).toEqual(result);
  });

  it("rejects with MissingCustomFieldsError and does not write the file when a custom field is missing on the list", async () => {
    const listDetail = loadFixture("list-detail-response.json");
    const tmpPath = writeTempFieldMapping(loadFieldMapping());
    const originalContents = readFileSync(tmpPath, "utf-8");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/field")) {
          return jsonResponse({ fields: [{ id: "cf_agent_id_001", name: "Agent" }] });
        }
        return jsonResponse(listDetail);
      })
    );

    await expect(syncFieldMapping("pk_test_token", "901234567", { fieldMappingPath: tmpPath })).rejects.toBeInstanceOf(
      MissingCustomFieldsError
    );
    await expect(syncFieldMapping("pk_test_token", "901234567", { fieldMappingPath: tmpPath })).rejects.toThrow(
      /ACs/
    );

    expect(readFileSync(tmpPath, "utf-8")).toBe(originalContents);
  });

  it("main() exits 1 with a CLICKUP_API_TOKEN/CLICKUP_LIST_ID message when env vars are missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await syncMain({ SKIP_DOTENV: "1" });
    expect(code).toBe(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("CLICKUP_API_TOKEN");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("CLICKUP_LIST_ID");
    errorSpy.mockRestore();
  });

  it("main() exits 1 and prints the thrown error message when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ err: "Unauthorized" }, 401))
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await syncMain({ SKIP_DOTENV: "1", CLICKUP_API_TOKEN: "pk_test", CLICKUP_LIST_ID: "901234567" });
    expect(code).toBe(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("ClickUp API error");
    errorSpy.mockRestore();
  });

  it("prints a warning when the live list name does not match field-mapping.json's list_name", async () => {
    const listFields = loadFixture("list-fields-response.json");
    const tmpPath = writeTempFieldMapping(loadFieldMapping());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/field")) {
          return jsonResponse(listFields);
        }
        return jsonResponse({ name: "Some Other List" });
      })
    );

    await syncFieldMapping("pk_test_token", "901234567", { fieldMappingPath: tmpPath });

    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Warning: list name is");
    errorSpy.mockRestore();
  });
});

function syncedFieldMapping(): FieldMapping {
  const mapping = loadFieldMapping();
  return {
    ...mapping,
    clickup_list_id: "901234567",
    custom_fields: {
      criterios_de_aceite: { ...mapping.custom_fields.criterios_de_aceite!, clickup_field_id: "cf_criterios_001" },
      agent_id: { ...mapping.custom_fields.agent_id!, clickup_field_id: "cf_agent_id_001" },
    },
  };
}

describe("verify", () => {
  const listDetail = { id: "901234567" };

  function stubVerifyFetch(taskCustomFields: Array<{ id: string; name: string }>): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "POST" && url.endsWith("/task")) {
        return jsonResponse({ id: "86btest01" });
      }
      if (init.method === "POST" && url.includes("/field/")) {
        return jsonResponse({ id: "86btest01" });
      }
      if (init.method === "GET" && url.endsWith("/task/86btest01")) {
        return jsonResponse({ id: "86btest01", custom_fields: taskCustomFields });
      }
      if (init.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return jsonResponse(listDetail);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("creates a task, sets custom fields, reads them back, and deletes the task by default", async () => {
    const tmpPath = writeTempFieldMapping(syncedFieldMapping());
    const fetchMock = stubVerifyFetch([
      { id: "cf_criterios_001", name: "ACs" },
      { id: "cf_agent_id_001", name: "Agent" },
    ]);

    const taskId = await verify("pk_test_token", "901234567", { fieldMappingPath: tmpPath });

    expect(taskId).toBe("86btest01");
    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "DELETE");
    expect(deleteCall).toBeDefined();
  });

  it("skips deletion when cleanup is false", async () => {
    const tmpPath = writeTempFieldMapping(syncedFieldMapping());
    const fetchMock = stubVerifyFetch([
      { id: "cf_criterios_001", name: "ACs" },
      { id: "cf_agent_id_001", name: "Agent" },
    ]);

    await verify("pk_test_token", "901234567", { cleanup: false, fieldMappingPath: tmpPath });

    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "DELETE");
    expect(deleteCall).toBeUndefined();
  });

  it("throws and still deletes the task when a custom field is missing from the GET response", async () => {
    const tmpPath = writeTempFieldMapping(syncedFieldMapping());
    const fetchMock = stubVerifyFetch([{ id: "cf_criterios_001", name: "ACs" }]);

    await expect(verify("pk_test_token", "901234567", { fieldMappingPath: tmpPath })).rejects.toThrow(/Agent/);
    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "DELETE");
    expect(deleteCall).toBeDefined();
  });

  it("throws when a custom field is present but has no id in the GET response", async () => {
    const tmpPath = writeTempFieldMapping(syncedFieldMapping());
    stubVerifyFetch([
      { id: "", name: "ACs" },
      { id: "cf_agent_id_001", name: "Agent" },
    ]);

    await expect(verify("pk_test_token", "901234567", { fieldMappingPath: tmpPath })).rejects.toThrow(/has no id/);
  });

  it("logs a warning but does not throw when cleanup deletion fails", async () => {
    const tmpPath = writeTempFieldMapping(syncedFieldMapping());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (init.method === "POST" && url.endsWith("/task")) {
          return jsonResponse({ id: "86btest01" });
        }
        if (init.method === "POST" && url.includes("/field/")) {
          return jsonResponse({ id: "86btest01" });
        }
        if (init.method === "GET" && url.endsWith("/task/86btest01")) {
          return jsonResponse({
            id: "86btest01",
            custom_fields: [
              { id: "cf_criterios_001", name: "ACs" },
              { id: "cf_agent_id_001", name: "Agent" },
            ],
          });
        }
        if (init.method === "DELETE") {
          return jsonResponse({ err: "Not found" }, 404);
        }
        return jsonResponse({ id: "901234567" });
      })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const taskId = await verify("pk_test_token", "901234567", { fieldMappingPath: tmpPath });

    expect(taskId).toBe("86btest01");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("could not delete test task");
    errorSpy.mockRestore();
  });

  it("throws when field-mapping.json has an unset (<TBD>) custom field ID", async () => {
    const mapping = loadFieldMapping();
    const tmpPath = writeTempFieldMapping({
      ...mapping,
      custom_fields: {
        ...mapping.custom_fields,
        agent_id: { ...mapping.custom_fields.agent_id!, clickup_field_id: "<TBD>" },
      },
    });

    await expect(verify("pk_test_token", "901234567", { fieldMappingPath: tmpPath })).rejects.toThrow(/unset ID/);
  });

  it("main() exits 1 with a CLICKUP_API_TOKEN/CLICKUP_LIST_ID message when env vars are missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await verifyMain({ SKIP_DOTENV: "1" });
    expect(code).toBe(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("CLICKUP_API_TOKEN");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("CLICKUP_LIST_ID");
    errorSpy.mockRestore();
  });
});

describe("webhook ingress + field-mapping structure (clickup.test.ts deliverable)", () => {
  it("extracts the investigate stage from the staged webhook fixture", () => {
    const payload = loadFixture<Record<string, unknown>>("task-status-updated-investigate.json");
    expect(extractStageFromWebhook(payload as never, loadFieldMapping())).toBe("investigate");
  });

  it("loads the Needs Review status mapping for revision ingress", () => {
    const mapping = loadFieldMapping();
    expect(mapping.statuses.needs_review).toBe("needs review");
    expect(automationStatusDisplayName(mapping, "needs_review")).toBe("needs review");
  });

  it("returns an empty display name for a missing automation status key", () => {
    expect(automationStatusDisplayName({ clickup_list_id: "list", custom_fields: {}, statuses: {} }, "needs_review")).toBe("");
  });

  it("validates the Needs Review webhook fixture status transition", () => {
    const payload = loadFixture<{
      history_items?: Array<{ field?: unknown; after?: { status?: unknown } }>;
    }>("task-status-updated-needs-review.json");
    expect(payload.history_items?.[0]?.field).toBe("status");
    expect(payload.history_items?.[0]?.after?.status).toBe("needs review");
  });

  it("validates clickup/field-mapping.json against the FieldMapping shape", () => {
    const mapping = loadFieldMapping();
    expect(typeof mapping.clickup_list_id).toBe("string");
    expect(typeof mapping.statuses).toBe("object");
    for (const [key, field] of Object.entries(mapping.custom_fields)) {
      expect(typeof field.name).toBe("string");
      expect(typeof field.type).toBe("string");
      expect(typeof field.clickup_field_id).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});
