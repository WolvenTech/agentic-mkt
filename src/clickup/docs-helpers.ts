/**
 * ClickUp Docs v3 API helpers for the Content Quality Pipeline.
 * Supports Doc creation, page lookup/creation, content read/replace operations.
 * See ADR-004 and ADR-005 for architectural context.
 * See scripts/content-quality-proof.ts for ClickUp v3 API patterns.
 */

export type HttpMethod = "GET" | "POST" | "PUT";

export interface DocsClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Response from Doc creation or page operations. */
export interface DocOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/** ClickUp Doc object from API response. */
export interface ClickUpDocResponse {
  id: string;
  name?: string;
  parent?: { id: string; type: number };
  [key: string]: unknown;
}

/** ClickUp Page object from API response. */
export interface ClickUpPageResponse {
  id: string;
  name?: string;
  content?: string;
  [key: string]: unknown;
}

/** Page listing response. */
export interface ClickUpPagesListResponse {
  pages?: ClickUpPageResponse[];
  [key: string]: unknown;
}

const V3_BASE = "https://api.clickup.com";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Make a request to the ClickUp Docs v3 API.
 * Returns structured success/error response.
 */
async function docsRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  options: DocsClientOptions,
  body?: unknown
): Promise<DocOperationResult<T>> {
  const baseUrl = options.baseUrl ?? V3_BASE;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = DEFAULT_TIMEOUT_MS;

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
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: serializedBody,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `ClickUp API error: HTTP ${res.status}${text ? ` - ${text.slice(0, 200)}` : ""}`,
        status: res.status,
      };
    }

    if (res.status === 204) {
      return { success: true, data: undefined as T };
    }

    const data = (await res.json()) as T;
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = controller.signal.aborted;
    return {
      success: false,
      error: isAbort ? `Request timed out after ${timeout}ms` : `Request failed: ${message}`,
      status: isAbort ? 408 : 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a new ClickUp Doc under a list.
 * Returns the Doc ID or an error.
 * Corresponds to: POST /api/v3/workspaces/{workspace_id}/docs
 */
export async function createClickUpDoc(
  workspaceId: string,
  listId: string,
  taskId: string,
  options: DocsClientOptions
): Promise<DocOperationResult<string>> {
  const path = `/api/v3/workspaces/${workspaceId}/docs`;
  const body = {
    name: `Editorial workspace for ${taskId}`,
    parent: { id: listId, type: 6 },
    visibility: "PRIVATE",
    create_page: true,
  };

  const result = await docsRequest<ClickUpDocResponse>(
    "POST",
    path,
    options,
    body
  );

  if (!result.success) {
    return result;
  }

  const docId = result.data?.id;
  if (!docId) {
    return {
      success: false,
      error: "Doc created but response did not include id",
    };
  }

  return { success: true, data: docId };
}

/**
 * Fetch all pages in a Doc.
 * Corresponds to: GET /api/v3/workspaces/{workspace_id}/docs/{doc_id}/pages
 */
export async function listDocPages(
  workspaceId: string,
  docId: string,
  options: DocsClientOptions
): Promise<DocOperationResult<ClickUpPageResponse[]>> {
  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;

  const result = await docsRequest<ClickUpPagesListResponse>(
    "GET",
    path,
    options
  );

  if (!result.success) {
    return result;
  }

  const pages = result.data?.pages ?? [];
  return { success: true, data: pages };
}

/**
 * Find a page by name, or create it if it doesn't exist.
 * Returns the page ID or an error.
 */
export async function getOrCreatePageByName(
  workspaceId: string,
  docId: string,
  pageName: string,
  options: DocsClientOptions
): Promise<DocOperationResult<string>> {
  // List existing pages to find a match
  const listResult = await listDocPages(workspaceId, docId, options);
  if (!listResult.success) {
    return listResult;
  }

  const pages = listResult.data ?? [];
  const existing = pages.find((p) => p.name === pageName);

  if (existing?.id) {
    return { success: true, data: existing.id };
  }

  // Page doesn't exist; create it
  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;
  const body = {
    name: pageName,
    content: `# ${pageName}\n\n*Initial placeholder content for ${pageName}.*`,
    content_format: "text/md",
  };

  const createResult = await docsRequest<ClickUpPageResponse>(
    "POST",
    path,
    options,
    body
  );

  if (!createResult.success) {
    return createResult;
  }

  const pageId = createResult.data?.id;
  if (!pageId) {
    return {
      success: false,
      error: `Page '${pageName}' created but response did not include id`,
    };
  }

  return { success: true, data: pageId };
}

/**
 * Read page content as markdown.
 * Corresponds to: GET /api/v3/workspaces/{workspace_id}/docs/{doc_id}/pages/{page_id}?content_format=text/md
 */
export async function readPageContent(
  workspaceId: string,
  docId: string,
  pageId: string,
  options: DocsClientOptions
): Promise<DocOperationResult<string>> {
  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}?content_format=text/md`;

  const result = await docsRequest<ClickUpPageResponse>(
    "GET",
    path,
    options
  );

  if (!result.success) {
    return result;
  }

  const content = result.data?.content;
  if (content === undefined) {
    return {
      success: false,
      error: "Page fetched but response did not include content",
    };
  }

  return { success: true, data: content };
}

/**
 * Replace page content using content_edit_mode: "replace".
 * This preserves downstream pages when used with active stage pages.
 * Corresponds to: PUT /api/v3/workspaces/{workspace_id}/docs/{doc_id}/pages/{page_id}
 */
export async function replacePage(
  workspaceId: string,
  docId: string,
  pageId: string,
  content: string,
  options: DocsClientOptions
): Promise<DocOperationResult<void>> {
  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`;
  const body = {
    content: content,
    content_edit_mode: "replace",
    content_format: "text/md",
  };

  const result = await docsRequest<unknown>(
    "PUT",
    path,
    options,
    body
  );

  if (!result.success) {
    return result;
  }

  return { success: true };
}
