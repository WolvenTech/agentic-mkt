import { afterEach, describe, expect, it, vi } from "vitest";
import { main, runGate } from "./vendor-gate.js";

const VALID_ENV = {
  CLICKUP_API_TOKEN: "pk_test_token",
  CLICKUP_LIST_ID: "123",
  N8N_API_KEY: "n8n_test_key",
  N8N_API_URL: "https://n8n.example.test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vendor gate — isStrict() bypass enforcement", () => {
  it("enforces strict mode when VENDOR_GATE_STRICT=0 and CI=true", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0", CI: "true" });
    expect(code).toBe(1); // Should fail because strict mode enforced and env missing
    expect(errorSpy.mock.calls.flat().join("\n")).not.toContain("warn-only mode");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("allows warn-only when VENDOR_GATE_STRICT=0 and CI is not set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0" });
    expect(code).toBe(0); // Should succeed in warn-only mode
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("warn-only mode");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("allows warn-only when VENDOR_GATE_STRICT=0 and CI=false", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0", CI: "false" });
    expect(code).toBe(0); // Should succeed in warn-only mode
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("warn-only mode");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("vendor gate — runGate (mocked fetch)", () => {
  it("accepts CLICKUP_TOKEN fallback and uses the default N8N_API_URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({ fields: [{ name: "ACs" }, { name: "Agent" }] });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline" }] });
      })
    );

    const env = {
      CLICKUP_TOKEN: "pk_test_token",
      CLICKUP_LIST_ID: "123",
      N8N_API_KEY: "n8n_test_key",
    };
    const { checks, exitCode } = await runGate(env);
    expect(exitCode).toBe(0);
    expect(checks.find((c) => c.name === "clickup_token_configured")?.passed).toBe(true);
    expect(checks.find((c) => c.name === "n8n_api_url_configured")?.passed).toBe(true);
    expect(checks.find((c) => c.name === "n8n_api_url_configured")?.detail).toContain("https://n8n");
  });

  it("treats an explicit empty N8N_API_URL as unset", async () => {
    const env = {
      CLICKUP_API_TOKEN: "pk_test_token",
      CLICKUP_LIST_ID: "123",
      N8N_API_KEY: "n8n_test_key",
      N8N_API_URL: "",
    };
    const { checks, exitCode } = await runGate(env);
    expect(exitCode).toBe(1);
    expect(checks.find((c) => c.name === "n8n_api_url_configured")?.passed).toBe(false);
    expect(checks.find((c) => c.name === "n8n_api_url_configured")?.detail).toContain("unset");
  });

  it("returns exit 2 with clickup_list_reachable FAIL on a mocked ClickUp 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          return jsonResponse({ err: "Unauthorized" }, 401);
        }
        return jsonResponse({ data: [] }, 200);
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    const listCheck = checks.find((c) => c.name === "clickup_list_reachable");
    expect(listCheck?.passed).toBe(false);
    expect(listCheck?.detail).toContain("HTTP 401");
  });

  it("returns exit 2 with n8n_api_reachable FAIL on a mocked n8n 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({
              fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }],
            });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ err: "Unauthorized" }, 401);
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    const n8nCheck = checks.find((c) => c.name === "n8n_api_reachable");
    expect(n8nCheck?.passed).toBe(false);
    expect(n8nCheck?.detail).toContain("HTTP 401");
    expect(checks.find((c) => c.name === "n8n_call_agent_workflow_present")?.passed).toBe(false);
    expect(checks.find((c) => c.name === "n8n_main_workflow_present")?.passed).toBe(false);
  });

  it("uses fallback detail text when ClickUp responses omit names and field arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({});
          }
          return jsonResponse({});
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline" }] });
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    expect(checks.find((c) => c.name === "clickup_list_reachable")?.detail).toContain("-> '?'");
    expect(checks.find((c) => c.name === "clickup_custom_fields_present")?.detail).toContain("Missing custom fields");
  });

  it("returns exit 0 with all checks PASS on mocked success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({
              fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }],
            });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline" }] });
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(0);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it("does not run live checks when an env var is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { exitCode } = await runGate({ CLICKUP_API_TOKEN: "pk_test" });
    expect(exitCode).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a connection failure when fetch rejects (vendor unreachable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    expect(checks.find((c) => c.name === "clickup_list_reachable")?.detail).toContain("connection failed");
    expect(checks.find((c) => c.name === "n8n_api_reachable")?.detail).toContain("connection failed");
  });

  it("reports a non-Error fetch rejection as a connection failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "boom";
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    expect(checks.find((c) => c.name === "clickup_list_reachable")?.detail).toContain("boom");
  });
});

describe("vendor gate — main() CLI report (mocked fetch, isolated env)", () => {
  it("returns 1 and prints blockers when required env vars are missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1" });
    expect(code).toBe(1);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("FAIL");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Blockers:");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Set CLICKUP_API_TOKEN");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns 0 in warn-only mode when VENDOR_GATE_STRICT=0 despite missing env vars", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0" });
    expect(code).toBe(0);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("warn-only mode");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns 0 and prints 'Gate passed' on mocked success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({
              fields: [{ name: "ACs" }, { name: "Agent" }, { name: "revision_count" }],
            });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline" }] });
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await main({ ...VALID_ENV, SKIP_DOTENV: "1" });
    expect(code).toBe(0);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Gate passed");
    logSpy.mockRestore();
  });

  it("returns 2 and prints a connectivity blocker on mocked vendor failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ err: "Unauthorized" }, 401))
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ ...VALID_ENV, SKIP_DOTENV: "1" });
    expect(code).toBe(2);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Fix vendor connectivity");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
