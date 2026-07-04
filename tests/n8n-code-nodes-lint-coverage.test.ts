import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it, beforeAll } from "vitest";
import { listCodeNodeSourceFiles, codeNodeSourceDir, TOKEN_PATTERN } from "../src/workflows/n8n-codegen";
import { CODE_NODE_TOKEN_PATTERN } from "../eslint.config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

/** listCodeNodeSourceFiles returns "<workflow>/<file>.js"; resolve via the shared directory helper. */
function toAbsolutePath(relativePath: string): string {
  const [workflowSlug, fileName] = relativePath.split("/");
  return resolve(codeNodeSourceDir(workflowSlug), fileName);
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

    const ignoredFlags = await Promise.all(absolutePaths.map((filePath) => eslint.isPathIgnored(filePath)));
    const ignoredFiles = absolutePaths.filter((_filePath, index) => ignoredFlags[index]);
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

  it("includes every tokenized (placeholder) source file in the lint run", async () => {
    // Derive the tokenized-file set from the source files themselves rather than a
    // hardcoded list, so a newly added @@TOKEN@@ file is automatically covered here.
    const tokenizedFiles = sourceFiles.filter((relativePath) => {
      const content = readFileSync(toAbsolutePath(relativePath), "utf8");
      return new RegExp(TOKEN_PATTERN).test(content);
    });

    expect(tokenizedFiles.length).toBeGreaterThan(0);

    for (const relativePath of tokenizedFiles) {
      expect(await eslint.isPathIgnored(toAbsolutePath(relativePath))).toBe(false);
    }
  });

  it("keeps the ESLint pre-render token pattern in sync with the build-time TOKEN_PATTERN", () => {
    // Both patterns must recognize exactly the same token grammar; if n8n-codegen.ts's
    // TOKEN_PATTERN grammar changes without eslint.config.mjs following, tokenized files
    // would silently fall back to unparseable @@..@@ syntax under lint again.
    const sampleTokens = ["@@DEFAULT_MODEL@@", "@@FIELD_ID_AGENT_ID@@", "@@REQUIRED_OUTPUT_KEYS@@"];
    const nonTokens = ["@@lowercase@@", "@@WITH_1_DIGIT@@", "plain text", "@@@@"];

    for (const sample of sampleTokens.concat(nonTokens)) {
      expect(new RegExp(CODE_NODE_TOKEN_PATTERN).test(sample)).toBe(new RegExp(TOKEN_PATTERN).test(sample));
    }
  });
});
