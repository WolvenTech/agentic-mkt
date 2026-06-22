import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLICKUP_API_BASE,
  ClickUpHttpError,
  ClickUpRequestError,
  clickupDelete,
  clickupGet,
  clickupPost,
  clickupPut,
} from "../src/clickup/client.js";

const FIXTURES_DIR = resolve(__dirname, "..", "clickup", "fixtures");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf-8")) as T;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const OPTIONS = { token: "pk_test_token" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clickupGet", () => {
  it("parses a 200 JSON body from /list/{id}", async () => {
    const fixture = loadFixture("list-detail-response.json");
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${CLICKUP_API_BASE}/list/901234567`);
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>).Authorization).toBe("pk_test_token");
      return jsonResponse(fixture, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await clickupGet("/list/901234567", OPTIONS);
    expect(result).toEqual(fixture);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parses a 200 JSON body from /list/{id}/field", async () => {
    const fixture = loadFixture("list-fields-response.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(fixture, 200))
    );

    const result = await clickupGet("/list/901234567/field", OPTIONS);
    expect(result).toEqual(fixture);
  });

  it("throws ClickUpHttpError with status and body snippet on 401", async () => {
    const errorBody = loadFixture("error-response.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(errorBody, 401))
    );

    await expect(clickupGet("/list/901234567", OPTIONS)).rejects.toMatchObject({
      name: "ClickUpHttpError",
      status: 401,
    });
    try {
      await clickupGet("/list/901234567", OPTIONS);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ClickUpHttpError);
      const httpErr = err as ClickUpHttpError;
      expect(httpErr.status).toBe(401);
      expect(httpErr.bodySnippet).toContain("Team not authorized");
    }
  });

  it("throws ClickUpHttpError with status 404 on a missing resource", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ err: "List not found" }, 404))
    );

    await expect(clickupGet("/list/does-not-exist", OPTIONS)).rejects.toMatchObject({
      name: "ClickUpHttpError",
      status: 404,
    });
  });

  it("throws ClickUpHttpError with status 500 on a server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ err: "Internal error" }, 500))
    );

    await expect(clickupGet("/list/901234567", OPTIONS)).rejects.toMatchObject({
      name: "ClickUpHttpError",
      status: 500,
    });
  });

  it("throws ClickUpRequestError on a request timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      })
    );

    const pending = clickupGet("/list/901234567", { ...OPTIONS, timeoutMs: 30_000 });
    const assertion = expect(pending).rejects.toMatchObject({ name: "ClickUpRequestError" });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.useRealTimers();
  });

  it("throws ClickUpRequestError on a network failure (no aborted signal)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    await expect(clickupGet("/list/901234567", OPTIONS)).rejects.toMatchObject({
      name: "ClickUpRequestError",
    });
  });
});

describe("clickupPost", () => {
  it("serializes the body as JSON and sets Content-Type", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      expect(init.body).toBe(JSON.stringify({ value: "linkedin-writer" }));
      return jsonResponse({ id: "86btest01" }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await clickupPost<{ id: string }>(
      "/task/86btest01/field/cf_agent_id_001",
      { value: "linkedin-writer" },
      OPTIONS
    );
    expect(result).toEqual({ id: "86btest01" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws ClickUpHttpError when the POST response is non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ err: "Bad request" }, 400))
    );

    await expect(clickupPost("/list/901234567/task", { name: "Test" }, OPTIONS)).rejects.toMatchObject({
      name: "ClickUpHttpError",
      status: 400,
    });
  });
});

describe("clickupPut and clickupDelete", () => {
  it("clickupPut sends a JSON body and parses the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        expect(init.method).toBe("PUT");
        return jsonResponse({ id: "86btest01", status: { status: "Ready to Work" } }, 200);
      })
    );

    const result = await clickupPut<{ id: string }>("/task/86btest01", { status: "Ready to Work" }, OPTIONS);
    expect(result.id).toBe("86btest01");
  });

  it("clickupDelete sends no body and returns undefined on 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        expect(init.method).toBe("DELETE");
        expect(init.body).toBeUndefined();
        return new Response(null, { status: 204 });
      })
    );

    const result = await clickupDelete("/task/86btest01", OPTIONS);
    expect(result).toBeUndefined();
  });
});

describe("module boundary", () => {
  it("exposes a stable import surface other ClickUp CLI modules can depend on without a cycle", async () => {
    const moduleExports = await import("../src/clickup/client.js");
    expect(typeof moduleExports.clickupGet).toBe("function");
    expect(typeof moduleExports.clickupPost).toBe("function");
    expect(typeof moduleExports.clickupPut).toBe("function");
    expect(typeof moduleExports.clickupDelete).toBe("function");
    expect(moduleExports.CLICKUP_API_BASE).toBe("https://api.clickup.com/api/v2");
  });
});
