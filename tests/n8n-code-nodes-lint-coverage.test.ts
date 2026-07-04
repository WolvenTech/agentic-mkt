import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it, beforeAll } from "vitest";
import { listCodeNodeSourceFiles } from "../src/workflows/n8n-codegen";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

/** listCodeNodeSourceFiles returns "<workflow>/<file>.js"; the file itself lives under code-nodes/. */
function toAbsolutePath(relativePath: string): string {
  const [workflowSlug, fileName] = relativePath.split("/");
  return resolve(REPO_ROOT, "src/workflows", workflowSlug, "code-nodes", fileName);
}

describe("n8n Code Node lint coverage", () => {
  let sourceFiles: string[] = [];
  let eslint: ESLint;

  beforeAll(() => {
    sourceFiles = listCodeNodeSourceFiles();
    eslint = new ESLint({ cwd: REPO_ROOT });
  });

  it("has a non-empty Code node source inventory to guard", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("lints every Code node source file, including tokenized ones, with zero errors", async () => {
    const absolutePaths = sourceFiles.map(toAbsolutePath);

    const ignoredFiles: string[] = [];
    for (const filePath of absolutePaths) {
      if (await eslint.isPathIgnored(filePath)) {
        ignoredFiles.push(filePath);
      }
    }
    expect(ignoredFiles).toEqual(
      [],
      `Code node source files must not be excluded from lint:code-nodes:\n${ignoredFiles.join("\n")}`
    );

    const results = await eslint.lintFiles(absolutePaths);
    expect(results.length).toBe(absolutePaths.length);

    const failing = results
      .filter((result) => result.errorCount > 0)
      .map((result) => `${result.filePath}: ${result.messages.map((m) => m.message).join("; ")}`);

    expect(failing).toEqual([], `Lint errors found in Code node source files:\n${failing.join("\n")}`);
  });

  it("includes the tokenized (placeholder) source files in the lint run", async () => {
    const tokenizedFiles = [
      "call-agent/assemble-prompt.js",
      "call-agent/parse-agent-output.js",
      "marketing-pipeline/extract-task-fields.js",
      "marketing-pipeline/format-draft-comment.js",
      "marketing-pipeline/extract-stage.js",
      "marketing-pipeline/persist-doc-pointer.js",
      "marketing-pipeline/prepare-staged-call-agent-input.js",
    ];

    for (const relativePath of tokenizedFiles) {
      expect(sourceFiles).toContain(relativePath);
      expect(await eslint.isPathIgnored(toAbsolutePath(relativePath))).toBe(false);
    }
  });
});
