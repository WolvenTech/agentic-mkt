import { afterEach, describe, expect, it, vi } from "vitest";
import {
  N8N_API_URL_DEFAULT,
  N8nHttpError,
  N8nRequestError,
  createN8nClient,
  n8nClientFromEnv,
  summarizeExecution,
  type N8nExecution,
} from "../src/n8n/client.js";

const OPTIONS = { apiKey: "n8n_test_key" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function webhookExecution(overrides: Partial<N8nExecution> = {}): N8nExecution {
  return {
    id: "1254",
    finished: true,
    status: "success",
    startedAt: "2026-06-22T12:00:00.000Z",
    stoppedAt: "2026-06-22T12:00:08.400Z",
    workflowId: "wf-main",
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
                        webhook_id: "wh-1",
                        history_items: [
                          {
                            id: "hist-1",
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
          "POST Task Comment": [{ executionTime: 80 }],
          "Status → Review": [{ executionTime: 60 }],
        },
      },
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createN8nClient", () => {
  it("lists workflows with X-N8N-API-KEY auth", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${N8N_API_URL_DEFAULT}/api/v1/workflows?limit=25`);
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>)["X-N8N-API-KEY"]).toBe("n8n_test_key");
      return jsonResponse({
        data: [
          { id: "1", name: "Marketing Pipeline", active: true },
          { id: "2", name: "Call Agent", active: true },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createN8nClient(OPTIONS);
    const workflows = await client.listWorkflows(25);
    expect(workflows).toHaveLength(2);
    expect(workflows[0]?.name).toBe("Marketing Pipeline");
  });

  it("gets an execution without includeData by default", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${N8N_API_URL_DEFAULT}/api/v1/executions/1250`);
      return jsonResponse({ id: "1250", status: "error", finished: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createN8nClient(OPTIONS);
    const execution = await client.getExecution("1250");
    expect(execution.id).toBe("1250");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gets an execution with includeData=true when requested", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${N8N_API_URL_DEFAULT}/api/v1/executions/1254?includeData=true`);
      return jsonResponse(webhookExecution());
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createN8nClient(OPTIONS);
    const execution = await client.getExecution("1254", true);
    expect(execution.data?.resultData?.runData?.["ClickUp Webhook"]).toBeTruthy();
  });

  it("lists executions with workflowId and limit filters", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${N8N_API_URL_DEFAULT}/api/v1/executions?workflowId=wf-main&limit=15`);
      return jsonResponse({ data: [{ id: "125:25:0", status: "success" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createN8nClient(OPTIONS);
    const executions = await client.listExecutions({ workflowId: "wf-main", limit: 15 });
    expect(executions).toHaveLength(1);
  });

  it("strips trailing slashes from apiUrl", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://n8n.example.com/api/v1/workflows?limit=100");
      return jsonResponse({ data: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createN8nClient({ apiKey: "key", apiUrl: "https://n8n.example.com/" });
    await client.listWorkflows();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws N8nHttpError on non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "Unauthorized" }, 401))
    );

    const client = createN8nClient(OPTIONS);
    await expect(client.listWorkflows()).rejects.toMatchObject({
      name: "N8nHttpError",
      status: 401,
    });
  });

  it("throws N8nRequestError on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    const client = createN8nClient(OPTIONS);
    await expect(client.listWorkflows()).rejects.toBeInstanceOf(N8nRequestError);
  });

  it("throws N8nHttpError with body snippet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "Not found" }, 404))
    );

    const client = createN8nClient(OPTIONS);
    try {
      await client.getExecution("missing");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(N8nHttpError);
      const httpErr = err as N8nHttpError;
      expect(httpErr.status).toBe(404);
      expect(httpErr.bodySnippet).toContain("Not found");
    }
  });
});

describe("n8nClientFromEnv", () => {
  it("reads N8N_API_URL and N8N_API_KEY from env", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = n8nClientFromEnv({
      N8N_API_URL: "https://n8n.custom.example/",
      N8N_API_KEY: " env-key ",
    });
    await client.listWorkflows();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.custom.example/api/v1/workflows?limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-N8N-API-KEY": "env-key" }),
      })
    );
  });

  it("throws when N8N_API_KEY is missing", () => {
    expect(() => n8nClientFromEnv({})).toThrow("N8N_API_KEY is required");
  });
});

describe("summarizeExecution", () => {
  it("summarizes a full happy-path execution", () => {
    const summary = summarizeExecution(webhookExecution());
    expect(summary).toEqual({
      execution_id: "1254",
      task_id: "86aj66hkb",
      transition: "backlog → ready",
      path: "full",
      duration_ms: 8400,
    });
  });

  it("unwraps webhook payloads nested under body", () => {
    const execution = webhookExecution({
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
                          body: {
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
                      },
                    ],
                  ],
                },
              },
            ],
            "Extract Webhook Context": [{ executionTime: 1 }],
          },
        },
      },
    });

    const summary = summarizeExecution(execution);
    expect(summary.task_id).toBe("86aj66hhg");
    expect(summary.transition).toBe("backlog → ready");
    expect(summary.path).toBe("full");
  });

  it("summarizes a filtered self-echo execution", () => {
    const execution = webhookExecution({
      id: "1256",
      status: "success",
      startedAt: "2026-06-22T12:01:00.000Z",
      stoppedAt: "2026-06-22T12:01:00.007Z",
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
    });

    const summary = summarizeExecution(execution);
    expect(summary).toMatchObject({
      execution_id: "1256",
      task_id: "86aj66hkb",
      transition: "ready → writing",
      path: "filtered",
      duration_ms: 7,
    });
    expect(summary.failed_node).toBeUndefined();
  });

  it("summarizes an error execution with failed node", () => {
    const execution = webhookExecution({
      id: "1250",
      status: "error",
      startedAt: "2026-06-22T11:59:00.000Z",
      stoppedAt: "2026-06-22T11:59:08.900Z",
      data: {
        resultData: {
          error: {
            node: { name: "POST Task Comment" },
            message: "The resource you are requesting could not be found",
          },
          runData: {
            "ClickUp Webhook": webhookExecution().data!.resultData!.runData!["ClickUp Webhook"],
            "Extract Webhook Context": [{ executionTime: 5 }],
            "GET ClickUp Task": [{ executionTime: 120 }],
            "Execute Call Agent": [{ executionTime: 5400 }],
            "POST Task Comment": [{ executionTime: 80, error: { message: "404" } }],
          },
        },
      },
    });

    const summary = summarizeExecution(execution);
    expect(summary).toMatchObject({
      execution_id: "1250",
      task_id: "86aj66hkb",
      transition: "backlog → ready",
      path: "error",
      duration_ms: 8900,
      failed_node: "POST Task Comment",
    });
  });

  it("falls back to runData executionTime sum when timestamps are missing", () => {
    const execution = webhookExecution({
      startedAt: undefined,
      stoppedAt: undefined,
      data: {
        resultData: {
          runData: {
            "ClickUp Webhook": webhookExecution().data!.resultData!.runData!["ClickUp Webhook"],
            "Extract Webhook Context": [{ executionTime: 10 }],
            "GET ClickUp Task": [{ executionTime: 90 }],
          },
        },
      },
    });

    expect(summarizeExecution(execution).duration_ms).toBe(100);
  });
});
