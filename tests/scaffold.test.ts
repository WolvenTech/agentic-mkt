import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");

const TASK_01_PATHS = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "integrations/marketing-pipelines/README.md",
  "integrations/marketing-pipelines/marketing-pipeline-main.json",
  "integrations/marketing-pipelines/call-agent-subworkflow.json",
  "integrations/clickup/README.md",
  "integrations/clickup/field-mapping.json",
  "agents/harness/README.md",
  "agents/harness/io-contract.md",
  "agents/harness/output-schema.json",
  "agents/README.md",
  "agents/skills",
];

const TOP_LEVEL_DOMAIN_FOLDERS = ["agents"];
const INTEGRATION_FOLDERS = ["integrations/clickup", "integrations/marketing-pipelines"];

const README_REQUIRED_SECTIONS = ["purpose", "key files", "manual setup"];
const ROOT_README_REQUIRED_SECTIONS = ["architecture", "quick start", "repository layout"];

describe("task_01 scaffold", () => {
  it("creates every task_01 path", () => {
    const missing = TASK_01_PATHS.filter((path) => !existsSync(resolve(REPO_ROOT, path)));
    expect(missing).toEqual([]);
  });

  it("keeps the top-level domain folders", () => {
    const missing = TOP_LEVEL_DOMAIN_FOLDERS.filter(
      (dir) => !statSync(resolve(REPO_ROOT, dir), { throwIfNoEntry: false })?.isDirectory()
    );
    expect(missing).toEqual([]);
  });

  it("keeps the integration folders", () => {
    const missing = INTEGRATION_FOLDERS.filter(
      (dir) => !statSync(resolve(REPO_ROOT, dir), { throwIfNoEntry: false })?.isDirectory()
    );
    expect(missing).toEqual([]);
  });

  it("documents the root README with the required sections", () => {
    const readme = resolve(REPO_ROOT, "README.md");
    expect(existsSync(readme)).toBe(true);
    const lower = readFileSync(readme, "utf-8").toLowerCase();
    for (const section of ROOT_README_REQUIRED_SECTIONS) {
      expect(lower).toContain(section);
    }
  });

  it("documents the pnpm quick-start commands in the root README", () => {
    const lower = readFileSync(resolve(REPO_ROOT, "README.md"), "utf-8").toLowerCase();
    expect(lower).toContain("pnpm install");
    expect(lower).toContain("pnpm test");
    expect(lower).toContain("pnpm vendor:gate");
  });

  it("keeps domain READMEs non-empty with the required sections", () => {
    for (const folder of TOP_LEVEL_DOMAIN_FOLDERS) {
      const readme = resolve(REPO_ROOT, folder, "README.md");
      expect(existsSync(readme)).toBe(true);
      const content = readFileSync(readme, "utf-8").trim();
      expect(content.length).toBeGreaterThan(0);
      const lower = content.toLowerCase();
      for (const section of README_REQUIRED_SECTIONS) {
        expect(lower).toContain(section);
      }
    }
  });

  it("keeps integration READMEs non-empty with the required sections", () => {
    for (const folder of INTEGRATION_FOLDERS) {
      const readme = resolve(REPO_ROOT, folder, "README.md");
      expect(existsSync(readme)).toBe(true);
      const content = readFileSync(readme, "utf-8").trim();
      expect(content.length).toBeGreaterThan(0);
      const lower = content.toLowerCase();
      for (const section of README_REQUIRED_SECTIONS) {
        expect(lower).toContain(section);
      }
    }
  });

  it("keeps the workflow placeholder filenames", () => {
    const workflows = resolve(REPO_ROOT, "integrations", "marketing-pipelines");
    const expected = ["marketing-pipeline-main.json", "call-agent-subworkflow.json"];
    const actual = readdirSync(workflows);
    for (const name of expected) {
      expect(actual).toContain(name);
    }
  });

  it("has an agents/harness directory", () => {
    const harness = resolve(REPO_ROOT, "agents", "harness");
    expect(statSync(harness, { throwIfNoEntry: false })?.isDirectory()).toBe(true);
  });

  it("has an agents/skills directory", () => {
    const skills = resolve(REPO_ROOT, "agents", "skills");
    expect(statSync(skills, { throwIfNoEntry: false })?.isDirectory()).toBe(true);
  });

  it("keeps field-mapping.json structurally valid", () => {
    const path = resolve(REPO_ROOT, "integrations", "clickup", "field-mapping.json");
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const customFields = data.custom_fields ?? {};
    expect(Object.keys(customFields).length).toBeGreaterThan(0);
    expect(data).toHaveProperty("list_name");
    expect(data).toHaveProperty("statuses");
    for (const [key, field] of Object.entries(customFields) as [string, Record<string, unknown>][]) {
      expect(field, `${key} missing name`).toHaveProperty("name");
      expect(field, `${key} missing clickup_field_id`).toHaveProperty("clickup_field_id");
    }
  });

  it("keeps the marketing-pipeline-main workflow export non-empty", () => {
    const path = resolve(REPO_ROOT, "integrations", "marketing-pipelines", "marketing-pipeline-main.json");
    const data = JSON.parse(readFileSync(path, "utf-8"));
    expect(data).not.toHaveProperty("_comment");
    expect((data.nodes ?? []).length).toBeGreaterThan(0);
  });

  it("keeps the call-agent-subworkflow export non-empty", () => {
    const path = resolve(REPO_ROOT, "integrations", "marketing-pipelines", "call-agent-subworkflow.json");
    const data = JSON.parse(readFileSync(path, "utf-8"));
    expect(data).not.toHaveProperty("_comment");
    expect((data.nodes ?? []).length).toBeGreaterThan(0);
  });
});
