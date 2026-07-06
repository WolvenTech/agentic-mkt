import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  createClickUpDoc,
  getOrCreatePageByName,
  listDocPages,
  readPageContent,
  replacePage,
  type DocsClientOptions,
  type ClickUpDocResponse,
  type ClickUpPageResponse,
  type ClickUpPagesListResponse,
} from "./docs-helpers.js";

const OPTIONS: DocsClientOptions = { token: "pk_test_token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createClickUpDoc", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a Doc and returns the doc_id", async () => {
    const mockResponse: ClickUpDocResponse = {
      id: "doc_abc123",
      name: "Editorial workspace for task_123",
      parent: { id: "list_456", type: 6 },
    };

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/api/v3/workspaces/workspace_789/docs");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.name).toContain("task_123");
      expect(body.parent).toEqual({ id: "list_456", type: 6 });
      return jsonResponse(mockResponse, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClickUpDoc(
      "workspace_789",
      "list_456",
      "task_123",
      OPTIONS
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe("doc_abc123");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns error when API fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Unauthorized", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClickUpDoc(
      "workspace_789",
      "list_456",
      "task_123",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
  });

  it("returns error when response has no doc id", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({ name: "Some doc" }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClickUpDoc(
      "workspace_789",
      "list_456",
      "task_123",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not include id");
  });

  it("handles network timeout", async () => {
    const fetchMock = vi.fn(async () => {
      const controller = new AbortController();
      // Simulate abort
      controller.abort();
      throw new Error("Aborted");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClickUpDoc(
      "workspace_789",
      "list_456",
      "task_123",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("listDocPages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists all pages in a Doc", async () => {
    const mockResponse: ClickUpPagesListResponse = {
      pages: [
        { id: "page_1", name: "Brief" },
        { id: "page_2", name: "Argument" },
        { id: "page_3", name: "Final Draft" },
      ],
    };

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/api/v3/workspaces/workspace_789/docs/doc_abc123/pages");
      expect(init.method).toBe("GET");
      return jsonResponse(mockResponse, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocPages("workspace_789", "doc_abc123", OPTIONS);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
    expect(result.data?.[0]?.name).toBe("Brief");
  });

  it("returns empty list when no pages exist", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({ pages: [] }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocPages("workspace_789", "doc_abc123", OPTIONS);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("handles missing pages field in response", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({}, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocPages("workspace_789", "doc_abc123", OPTIONS);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns error when API fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocPages("workspace_789", "doc_abc123", OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
  });
});

describe("getOrCreatePageByName", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns existing page id when page exists", async () => {
    const listResponse: ClickUpPagesListResponse = {
      pages: [
        { id: "page_brief_123", name: "Brief" },
        { id: "page_arg_456", name: "Argument" },
      ],
    };

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/pages") && init.method === "GET") {
        return jsonResponse(listResponse, 200);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrCreatePageByName(
      "workspace_789",
      "doc_abc123",
      "Brief",
      OPTIONS
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe("page_brief_123");
  });

  it("creates page when it doesn't exist", async () => {
    const listResponse: ClickUpPagesListResponse = {
      pages: [{ id: "page_arg_456", name: "Argument" }],
    };
    const createResponse: ClickUpPageResponse = {
      id: "page_brief_new",
      name: "Brief",
    };

    let callCount = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // List pages
        expect(url).toContain("/pages");
        expect(init.method).toBe("GET");
        return jsonResponse(listResponse, 200);
      } else {
        // Create page
        expect(url).toContain("/pages");
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body.name).toBe("Brief");
        expect(body.content_format).toBe("text/md");
        return jsonResponse(createResponse, 201);
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrCreatePageByName(
      "workspace_789",
      "doc_abc123",
      "Brief",
      OPTIONS
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe("page_brief_new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns error if list fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Forbidden", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrCreatePageByName(
      "workspace_789",
      "doc_abc123",
      "Brief",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("returns error if create fails", async () => {
    const listResponse: ClickUpPagesListResponse = { pages: [] };

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return jsonResponse(listResponse, 200);
      }
      return new Response("Server Error", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrCreatePageByName(
      "workspace_789",
      "doc_abc123",
      "Brief",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns error if create response has no id", async () => {
    const listResponse: ClickUpPagesListResponse = { pages: [] };

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return jsonResponse(listResponse, 200);
      }
      return jsonResponse({ name: "Brief" }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrCreatePageByName(
      "workspace_789",
      "doc_abc123",
      "Brief",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not include id");
  });
});

describe("readPageContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads page content as markdown", async () => {
    const content = "# Brief\n\nSome content here";
    const mockResponse: ClickUpPageResponse = {
      id: "page_brief_123",
      name: "Brief",
      content: content,
    };

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/pages/page_brief_123");
      expect(url).toContain("content_format=text/md");
      expect(init.method).toBe("GET");
      return jsonResponse(mockResponse, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readPageContent(
      "workspace_789",
      "doc_abc123",
      "page_brief_123",
      OPTIONS
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe(content);
  });

  it("returns error when API fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readPageContent(
      "workspace_789",
      "doc_abc123",
      "page_invalid",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
  });

  it("returns error when response has no content", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({ id: "page_brief_123", name: "Brief" }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readPageContent(
      "workspace_789",
      "doc_abc123",
      "page_brief_123",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not include content");
  });
});

describe("replacePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces page content with replace mode", async () => {
    const newContent = "# Brief v2\n\nUpdated content";

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/pages/page_brief_123");
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.content).toBe(newContent);
      expect(body.content_edit_mode).toBe("replace");
      expect(body.content_format).toBe("text/md");
      return jsonResponse({ id: "page_brief_123" }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await replacePage(
      "workspace_789",
      "doc_abc123",
      "page_brief_123",
      newContent,
      OPTIONS
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns error when API fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Forbidden", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await replacePage(
      "workspace_789",
      "doc_abc123",
      "page_brief_123",
      "# New content",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("preserves content_edit_mode=replace for downstream preservation", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      // This ensures content_edit_mode is exactly "replace" to avoid cascade updates
      expect(body.content_edit_mode).toBe("replace");
      return jsonResponse({}, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    await replacePage(
      "workspace_789",
      "doc_abc123",
      "page_brief_123",
      "New content",
      OPTIONS
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("downstream page preservation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces active stage page without affecting other pages", async () => {
    // This test demonstrates that replacePage with content_edit_mode: "replace"
    // is designed for single-page replacement that doesn't cascade to other pages.

    const listResponse: ClickUpPagesListResponse = {
      pages: [
        { id: "page_1", name: "Brief" },
        { id: "page_2", name: "Argument" },
        { id: "page_3", name: "Final Draft" },
      ],
    };

    let requestCount = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      requestCount++;

      if (url.includes("/pages") && init.method === "GET" && !url.includes("/pages/page")) {
        // List pages
        return jsonResponse(listResponse, 200);
      }

      if (url.includes("/pages/page_1") && init.method === "PUT") {
        // Replace Brief page
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body.content_edit_mode).toBe("replace");
        return jsonResponse({ id: "page_1" }, 200);
      }

      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Simulate workflow: list pages, then replace only Brief
    const listResult = await listDocPages("workspace_789", "doc_abc123", OPTIONS);
    expect(listResult.success).toBe(true);
    expect(listResult.data).toHaveLength(3);

    const replaceResult = await replacePage(
      "workspace_789",
      "doc_abc123",
      "page_1",
      "# Brief v2\n\nUpdated",
      OPTIONS
    );
    expect(replaceResult.success).toBe(true);

    // Verify: only the Brief page was modified with replace mode,
    // which means Argument and Final Draft pages are untouched
    const calls = fetchMock.mock.calls;
    const replaceCalls = calls.filter(
      (c) => String(c[0]).includes("page_1") && (c[1] as RequestInit).method === "PUT"
    );
    expect(replaceCalls.length).toBeGreaterThan(0);
  });
});

describe("request error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles network request failures gracefully", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Network error");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocPages("workspace_789", "doc_abc123", OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles JSON parsing errors in responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Invalid JSON {", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClickUpDoc(
      "workspace_789",
      "list_456",
      "task_123",
      OPTIONS
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
