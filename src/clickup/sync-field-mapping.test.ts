import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFieldMapping } from "../marketing-pipeline/logic.js";
import { MissingCustomFieldsError, main as syncMain, syncFieldMapping } from "./sync-field-mapping.js";
import type { FieldMapping } from "../types/field-mapping.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FIXTURES_DIR = resolve(REPO_ROOT, "integrations", "clickup", "fixtures");

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
