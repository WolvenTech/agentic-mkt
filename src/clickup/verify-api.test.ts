import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFieldMapping } from "../marketing-pipeline/logic.js";
import type { FieldMapping } from "../types/field-mapping.js";
import { main as verifyMain, verify } from "./verify-api.js";

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
