export const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
const DEFAULT_TIMEOUT_MS = 30_000;

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ClickUpClientOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** HTTP error response from the ClickUp API — carries status and a truncated body for diagnostics. */
export class ClickUpHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string) {
    super(`ClickUp API error: HTTP ${status}${bodySnippet ? ` - ${bodySnippet}` : ""}`);
    this.name = "ClickUpHttpError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

/** Transport-level failure (timeout or network error) — the request never produced an HTTP response. */
export class ClickUpRequestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ClickUpRequestError";
  }
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body: unknown,
  options: ClickUpClientOptions
): Promise<T> {
  const baseUrl = options.baseUrl ?? CLICKUP_API_BASE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const headers: Record<string, string> = {
    Authorization: options.token,
    Accept: "application/json",
  };
  let serializedBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    serializedBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: serializedBody,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ClickUpRequestError(`ClickUp request timed out after ${timeoutMs}ms: ${method} ${path}`, err);
    }
    throw new ClickUpRequestError(`ClickUp request failed: ${method} ${path}`, err);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ClickUpHttpError(res.status, text.slice(0, 200));
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** GET a ClickUp API path and parse the JSON response. */
export function clickupGet<T>(path: string, options: ClickUpClientOptions): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

/** POST a JSON body to a ClickUp API path and parse the JSON response. */
export function clickupPost<T>(path: string, body: unknown, options: ClickUpClientOptions): Promise<T> {
  return request<T>("POST", path, body, options);
}

/** PUT a JSON body to a ClickUp API path and parse the JSON response. */
export function clickupPut<T>(path: string, body: unknown, options: ClickUpClientOptions): Promise<T> {
  return request<T>("PUT", path, body, options);
}

/** DELETE a ClickUp API path and parse the JSON response, if any. */
export function clickupDelete<T>(path: string, options: ClickUpClientOptions): Promise<T> {
  return request<T>("DELETE", path, undefined, options);
}
