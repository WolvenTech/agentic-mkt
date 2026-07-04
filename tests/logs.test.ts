import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const EVIDENCE_PATH = resolve(REPO_ROOT, "agents", "harness", "green-run-evidence.json");

/**
 * Sensitive key names that must not appear in log output.
 * These are specific field names from ClickUp/n8n API responses that should not be serialized.
 * Note: keys like "description" are problematic when they contain raw API payloads,
 * but okay when they're part of a status field like "brief_content_written" (a boolean string).
 */
const SENSITIVE_KEYS = [
  // Credential patterns (exact match, as these are standalone)
  "token",
  "apiKey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "credential",

  // ClickUp API response fields (exact match for top-level keys)
  "markdown_content",
  "comment_text",
  "text_content",
  "custom_fields",
  "attachments",
  "watchers",
  "priority",
  "due_date",
  "date_created",
  "date_updated",
];

/**
 * Recursively collect all keys from an object or array structure.
 */
function collectAllKeys(value: unknown): Set<string> {
  const keys = new Set<string>();

  function traverse(item: unknown): void {
    if (item === null || item === undefined) {
      return;
    }

    if (typeof item === "object") {
      if (Array.isArray(item)) {
        for (const elem of item) {
          traverse(elem);
        }
      } else {
        for (const [key, val] of Object.entries(item)) {
          keys.add(key);
          traverse(val);
        }
      }
    }
  }

  traverse(value);
  return keys;
}

/**
 * Check if JSON string contains full raw API payloads.
 * Looks for patterns like serialized task/doc objects with many ClickUp fields together.
 */
function hasRawApiPayload(jsonString: string): boolean {
  // Pattern: multiple ClickUp-specific fields in sequence suggests a serialized API response
  // We're looking for things like: "id", "name", "status", "priority", "due_date", etc. all together
  // This would indicate a full task/doc object was serialized, not just extracted fields

  // Simple heuristic: check for presence of many API fields together
  const clickupFields = [
    '"id"',
    '"name"',
    '"status"',
    '"priority"',
    '"due_date"',
    '"date_created"',
    '"comments"',
  ];
  const foundCount = clickupFields.filter((field) => jsonString.includes(field)).length;

  // If more than 4 ClickUp API fields appear together, it's likely a raw payload
  return foundCount >= 5;
}

describe("logs redaction: green-run evidence", () => {
  const skipIfNoEvidence = !existsSync(EVIDENCE_PATH);

  it("evidence.json exists at canonical path", { skip: skipIfNoEvidence }, () => {
    expect(existsSync(EVIDENCE_PATH)).toBe(true);
  });

  it("evidence.json parses as valid JSON", { skip: skipIfNoEvidence }, () => {
    const content = readFileSync(EVIDENCE_PATH, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("evidence.json does not contain raw credential values", { skip: skipIfNoEvidence }, () => {
    const content = readFileSync(EVIDENCE_PATH, "utf-8");
    const evidence = JSON.parse(content) as unknown;

    const keys = collectAllKeys(evidence);
    const sensitiveKeysFound = Array.from(keys).filter((key) =>
      SENSITIVE_KEYS.some((sensitive) => key === sensitive) // Exact match only
    );

    expect(sensitiveKeysFound, `Found problematic sensitive keys: ${sensitiveKeysFound.join(", ")}`).toEqual([]);
  });

  it("evidence.json does not contain serialized raw API payloads", { skip: skipIfNoEvidence }, () => {
    const content = readFileSync(EVIDENCE_PATH, "utf-8");

    expect(hasRawApiPayload(content), "Evidence contains signs of raw serialized API payloads").toBe(false);
  });

  it("evidence.json contains only structured summary fields", { skip: skipIfNoEvidence }, () => {
    const content = readFileSync(EVIDENCE_PATH, "utf-8");
    const evidence = JSON.parse(content) as Record<string, unknown>;

    // Verify the top-level structure is as expected
    expect(evidence).toHaveProperty("recorded_at");
    expect(evidence).toHaveProperty("session");
    expect(evidence).toHaveProperty("validation_status");
    expect(evidence).toHaveProperty("preflight");
    expect(evidence).toHaveProperty("main_workflow");
    expect(evidence).toHaveProperty("call_agent_subworkflow");

    // Verify main_workflow contains only safe fields (IDs and URLs are okay)
    const mainWorkflow = evidence.main_workflow as Record<string, unknown>;
    expect(mainWorkflow).toHaveProperty("verified");
    expect(mainWorkflow).toHaveProperty("clickup_task_id");
    expect(mainWorkflow).toHaveProperty("clickup_task_url");
    expect(mainWorkflow).toHaveProperty("latency_seconds");
    expect(mainWorkflow).not.toHaveProperty("markdown_content");
    expect(mainWorkflow).not.toHaveProperty("comment_text");
  });
});

describe("logs redaction: content-quality-proof evidence", () => {
  // Note: content-quality-proof logs may not exist in a fresh checkout
  // This test validates the structure when logs are present

  const logsDir = resolve(REPO_ROOT, "logs", "content-quality-proof");
  const logsExist = existsSync(logsDir);
  const fs = require("fs");
  // Filter for content-quality-proof timestamp format (YYYY-MM-DDTHH-mm-ss-sssZ.json)
  const files = logsExist
    ? fs.readdirSync(logsDir).filter((f: string) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/.test(f))
    : [];
  const skipIfNoLogs = !logsExist || files.length === 0;

  it("content-quality-proof logs, when present, follow the redaction rule", { skip: skipIfNoLogs }, () => {
    const latestFile = resolve(logsDir, files[files.length - 1]);
    const content = readFileSync(latestFile, "utf-8");
    const evidence = JSON.parse(content) as unknown;

    const keys = collectAllKeys(evidence);
    const sensitiveKeysFound = Array.from(keys).filter((key) =>
      SENSITIVE_KEYS.some((sensitive) => key === sensitive) // Exact match only
    );

    expect(sensitiveKeysFound, `Found problematic sensitive keys in content-quality-proof: ${sensitiveKeysFound.join(", ")}`).toEqual([]);
  });

  it("content-quality-proof evidence contains only structured status/evidence summaries", { skip: skipIfNoLogs }, () => {
    const latestFile = resolve(logsDir, files[files.length - 1]);
    const content = readFileSync(latestFile, "utf-8");
    const evidence = JSON.parse(content) as Record<string, unknown>;

    // Verify top-level structure
    expect(evidence).toHaveProperty("generated_at");
    expect(evidence).toHaveProperty("mode");
    expect(evidence).toHaveProperty("state");
    expect(evidence).toHaveProperty("evidence");

    // Verify evidence is an array of structured rows
    const evidenceRows = evidence.evidence as Array<Record<string, unknown>>;
    expect(Array.isArray(evidenceRows)).toBe(true);

    // Each row should have action/status/observed summary fields, not raw payloads
    for (const row of evidenceRows) {
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("status");
      expect(row).toHaveProperty("action");
      expect(row).toHaveProperty("observed");
      // Should NOT have raw API fields (these would be direct properties on the row)
      expect(row).not.toHaveProperty("markdown_content");
      expect(row).not.toHaveProperty("comment_text");
      expect(row).not.toHaveProperty("custom_fields");
    }
  });
});
