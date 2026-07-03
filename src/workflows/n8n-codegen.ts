import { readFileSync, readdirSync } from "node:fs";
import { resolve, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Derive __dirname from import.meta.url in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!__dirname) {
  throw new Error("Failed to derive __dirname from import.meta.url");
}

/** Join lines into n8n Code node jsCode (single source for string assembly). */
export function joinN8nJs(lines: string[]): string {
  return lines.join("\n");
}

// V1 supported workflow slugs (must match builder directory names)
const APPROVED_WORKFLOWS = new Set(["call-agent", "marketing-pipeline"]);

// Token pattern: @@TOKEN_NAME@@
const TOKEN_PATTERN = /@@([A-Z_]+)@@/g;

export interface CodeNodeSourceRef {
  workflowSlug: "call-agent" | "marketing-pipeline";
  nodeSlug: string;
  tokens?: Record<string, unknown>;
}

/**
 * Validate and resolve a code node source file path.
 * Rejects path traversal and returns the safe resolved path.
 * @throws {Error} if the path is unsafe or traversal is detected
 */
function resolveSourcePath(workflowSlug: string, nodeSlug: string): string {
  // Validate workflow slug
  if (!APPROVED_WORKFLOWS.has(workflowSlug)) {
    throw new Error(
      `Unsupported workflow slug: ${workflowSlug}. Must be one of: ${Array.from(APPROVED_WORKFLOWS).join(", ")}`
    );
  }

  // Validate node slug: must contain only alphanumeric, dash, and underscore
  if (!/^[a-z0-9_-]+$/.test(nodeSlug)) {
    throw new Error(
      `Invalid node slug: ${nodeSlug}. Must contain only lowercase alphanumeric characters, dashes, and underscores`
    );
  }

  // __dirname points to src/workflows, so go up one level to src
  const baseDir = resolve(__dirname, "..");
  const targetPath = resolve(baseDir, "workflows", workflowSlug, "code-nodes", `${nodeSlug}.js`);

  // Path traversal protection: ensure target is within expected directory
  const expectedBase = resolve(baseDir, "workflows", workflowSlug, "code-nodes");
  const normalized = normalize(targetPath);
  const normalizedBase = normalize(expectedBase);

  if (!normalized.startsWith(normalizedBase + sep) && normalized !== normalizedBase) {
    throw new Error(
      `Path traversal detected in node slug: ${nodeSlug}. Path resolves outside code-nodes directory`
    );
  }

  return targetPath;
}

/**
 * Load a code node source file and render tokens deterministically.
 * @throws {Error} if file not found, contains unresolved tokens, or has unused declared tokens
 */
export function loadCodeNodeSource(ref: CodeNodeSourceRef): string {
  const sourcePath = resolveSourcePath(ref.workflowSlug, ref.nodeSlug);

  let source: string;
  try {
    source = readFileSync(sourcePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Code node source file not found: ${ref.nodeSlug} (expected at ${sourcePath.replace(/.*src\//)})`
      );
    }
    throw new Error(`Failed to read code node source ${ref.nodeSlug}: ${(err as Error).message}`);
  }

  // Normalize line endings to \n (deterministic across platforms)
  let normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip IIFE wrapper if present (added for ESLint parsing compatibility)
  // Pattern: // comment\n(function() {\n...code...\n}());
  const iifePat = /^\/\/ n8n Code node source - wrapped in IIFE for parsing\n\(function\(\) \{\n([\s\S]*)\n\}\(\)\);\n$/;
  const iifMatch = normalized.match(iifePat);
  if (iifMatch) {
    normalized = iifMatch[1];
  }

  // If no tokens declared, return normalized source as-is
  const declaredTokens = ref.tokens ?? {};
  if (Object.keys(declaredTokens).length === 0) {
    // Still check for unresolved tokens even if none declared
    const unresolvedMatch = normalized.match(TOKEN_PATTERN);
    if (unresolvedMatch) {
      throw new Error(
        `Unresolved tokens in ${ref.nodeSlug}: ${unresolvedMatch.join(", ")}. ` +
          `No token map provided. Declare tokens in CodeNodeSourceRef.tokens`
      );
    }
    return normalized;
  }

  // Render declared tokens
  const usedTokens = new Set<string>();
  let rendered = normalized;
  let hasUnresolvedTokens = false;
  let unresolvedTokenNames: string[] = [];

  rendered = rendered.replace(TOKEN_PATTERN, (match, tokenName) => {
    if (!(tokenName in declaredTokens)) {
      hasUnresolvedTokens = true;
      unresolvedTokenNames.push(match);
      return match; // Keep unresolved for error reporting
    }
    usedTokens.add(tokenName);
    const value = declaredTokens[tokenName];
    // JSON.stringify ensures safe JavaScript literal representation
    return JSON.stringify(value);
  });

  if (hasUnresolvedTokens) {
    throw new Error(
      `Unresolved tokens in ${ref.nodeSlug}: ${unresolvedTokenNames.join(", ")}. ` +
        `Declare these tokens in the token map for this node`
    );
  }

  // Check for unused declared tokens (fail-closed: all declared tokens must be used)
  const declaredTokenNames = Object.keys(declaredTokens);
  const unusedTokens = declaredTokenNames.filter((name) => !usedTokens.has(name));

  if (unusedTokens.length > 0) {
    throw new Error(
      `Unused declared tokens in ${ref.nodeSlug}: ${unusedTokens.join(", ")}. ` +
        `Remove unused tokens or mark them optional by removing from the token map`
    );
  }

  return rendered;
}

/**
 * List all code node source files for ownership validation.
 * Returns relative paths like "call-agent/parse-agent-config.js"
 */
export function listCodeNodeSourceFiles(): string[] {
  const baseDir = resolve(__dirname, "..");
  const results: string[] = [];

  for (const workflow of APPROVED_WORKFLOWS) {
    const codeNodesDir = resolve(baseDir, "workflows", workflow, "code-nodes");
    try {
      const files = readdirSync(codeNodesDir, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && file.name.endsWith(".js")) {
          results.push(`${workflow}/${file.name}`);
        }
      }
    } catch {
      // Directory may not exist yet; skip
    }
  }

  return results.sort();
}

export interface N8nCodeNodeContext {
  input?: Record<string, unknown>;
  allInputs?: Array<Record<string, unknown>>;
  nodeOutputs?: Record<string, Record<string, unknown>>;
  executionId?: string;
  staticData?: Record<string, unknown>;
  now?: number;
}

/** Run generated n8n Code node jsCode in tests (mocks $input, $, $execution, staticData). */
export function runN8nCodeNode(jsCode: string, context: N8nCodeNodeContext = {}): unknown {
  const inputJson = context.input ?? {};
  const allInputs = context.allInputs ?? [inputJson];
  const $input = {
    first: () => ({ json: inputJson }),
    all: () => allInputs.map((json) => ({ json })),
  };
  const $ = (nodeName: string) => {
    const json = context.nodeOutputs?.[nodeName] ?? {};
    return { first: () => ({ json }), item: { json } };
  };
  const $execution = { id: context.executionId ?? "test-execution" };
  const staticStore = context.staticData ?? {};
  const $getWorkflowStaticData = () => staticStore;
  const DateLike = context.now !== undefined ? { now: () => context.now! } : Date;

  const fn = new Function(
    "$input",
    "$",
    "$execution",
    "$getWorkflowStaticData",
    "console",
    "Buffer",
    "Date",
    jsCode
  );

  return fn(
    $input,
    $,
    $execution,
    $getWorkflowStaticData,
    { log: () => undefined },
    Buffer,
    DateLike
  );
}

/** First item json from a Code node return array, or undefined. */
export function firstCodeNodeJson(result: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(result) || result.length === 0) {
    return undefined;
  }
  const item = result[0];
  if (item === null || typeof item !== "object" || !("json" in item)) {
    return undefined;
  }
  const json = (item as { json?: unknown }).json;
  return json !== null && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : undefined;
}
