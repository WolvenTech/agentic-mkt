import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCodeNodeSource, listCodeNodeSourceFiles } from "./n8n-codegen";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

describe("Code node source loader", () => {
  describe("loadCodeNodeSource validation", () => {
    it("rejects unsupported workflow slugs", () => {
      expect(() => {
        loadCodeNodeSource({
          workflowSlug: "unsupported" as any,
          nodeSlug: "test-node",
        });
      }).toThrow(/Unsupported workflow slug/);
    });

    it("rejects invalid node slugs with path traversal", () => {
      expect(() => {
        loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "../../../etc/passwd",
        });
      }).toThrow(/Invalid node slug.*lowercase alphanumeric/);
    });

    it("rejects invalid node slugs with uppercase", () => {
      expect(() => {
        loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "TestNode",
        });
      }).toThrow(/Invalid node slug/);
    });

    it("rejects invalid node slugs with special characters", () => {
      expect(() => {
        loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "test;rm -rf",
        });
      }).toThrow(/Invalid node slug/);
    });

    it("throws descriptive error for missing source file", () => {
      expect(() => {
        loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "nonexistent-file-xyz",
        });
      }).toThrow(/Code node source file not found: nonexistent-file-xyz/);
    });
  });

  describe("line ending normalization with temporary files", () => {
    it("normalizes CRLF line endings to LF", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "test-crlf-temp-linend.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = "line1\r\nline2\r\nline3";

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "test-crlf-temp-linend",
        });

        expect(result).toBe("line1\nline2\nline3");
        expect(result).not.toContain("\r");
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("normalizes mixed CR/CRLF to LF", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "test-mixed-temp-linend.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = "line1\r\nline2\rline3";

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "test-mixed-temp-linend",
        });

        expect(result).toBe("line1\nline2\nline3");
        expect(result).not.toContain("\r");
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("preserves LF line endings", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "test-lf-temp-linend.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = "line1\nline2\nline3";

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "test-lf-temp-linend",
        });

        expect(result).toBe(source);
      } finally {
        rmSync(filePath, { force: true });
      }
    });
  });

  describe("token rendering", () => {
    it("loads source with no tokens when no token map provided", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "no-tokens-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = "const x = 5;\nreturn [{ json: x }];";

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "no-tokens-temp",
        });

        expect(result).toBe(source);
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("renders all declared tokens from token map", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "with-tokens-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const model = @@DEFAULT_MODEL@@;\nconst temp = @@TEMPERATURE@@;\nreturn [{ json: { model, temp } }];';

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "with-tokens-temp",
          tokens: {
            DEFAULT_MODEL: "gpt-4",
            TEMPERATURE: 0.7,
          },
        });

        expect(result).toContain('"gpt-4"');
        expect(result).toContain("0.7");
        expect(result).not.toContain("@@");
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("renders tokens as JSON-safe JavaScript literals", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "json-literal-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const obj = @@CONFIG@@;';

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "json-literal-temp",
          tokens: {
            CONFIG: { key: "value", nested: { count: 42 } },
          },
        });

        expect(result).toContain('{"key":"value","nested":{"count":42}}');
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("fails when source contains unresolved token", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "unresolved-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const model = @@DEFAULT_MODEL@@;\nconst missing = @@MISSING_TOKEN@@;';

      try {
        writeFileSync(filePath, source);

        expect(() => {
          loadCodeNodeSource({
            workflowSlug: "call-agent",
            nodeSlug: "unresolved-temp",
            tokens: {
              DEFAULT_MODEL: "gpt-4",
            },
          });
        }).toThrow(/Unresolved tokens.*MISSING_TOKEN/);
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("fails when token declared but not used in source", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "unused-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const model = @@DEFAULT_MODEL@@;';

      try {
        writeFileSync(filePath, source);

        expect(() => {
          loadCodeNodeSource({
            workflowSlug: "call-agent",
            nodeSlug: "unused-temp",
            tokens: {
              DEFAULT_MODEL: "gpt-4",
              UNUSED_TOKEN: "should-not-be-here",
            },
          });
        }).toThrow(/Unused declared tokens.*UNUSED_TOKEN/);
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("fails when source has tokens but none declared in token map", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "no-map-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const model = @@DEFAULT_MODEL@@;';

      try {
        writeFileSync(filePath, source);

        expect(() => {
          loadCodeNodeSource({
            workflowSlug: "call-agent",
            nodeSlug: "no-map-temp",
            tokens: {},
          });
        }).toThrow(/Unresolved tokens.*DEFAULT_MODEL/);
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("fails when source has tokens but no token map provided", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "no-map-provided-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const model = @@DEFAULT_MODEL@@;';

      try {
        writeFileSync(filePath, source);

        expect(() => {
          loadCodeNodeSource({
            workflowSlug: "call-agent",
            nodeSlug: "no-map-provided-temp",
          });
        }).toThrow(/Unresolved tokens.*No token map provided/);
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("handles multiple occurrences of the same token", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "multi-token-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const a = @@TOKEN@@;\nconst b = @@TOKEN@@;\nconst c = @@TOKEN@@;';

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "multi-token-temp",
          tokens: {
            TOKEN: "value",
          },
        });

        expect(result).toBe('const a = "value";\nconst b = "value";\nconst c = "value";');
      } finally {
        rmSync(filePath, { force: true });
      }
    });

    it("handles special characters and escaping in token values", () => {
      const codeNodesDir = resolve(REPO_ROOT, "src/workflows/call-agent/code-nodes");
      const fileName = "escape-test-temp.js";
      const filePath = resolve(codeNodesDir, fileName);
      const source = 'const msg = @@MESSAGE@@;';

      try {
        writeFileSync(filePath, source);

        const result = loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "escape-test-temp",
          tokens: {
            MESSAGE: 'Hello "world" with \\backslash',
          },
        });

        expect(result).toContain('\\"');
        expect(result).toContain('\\\\');
      } finally {
        rmSync(filePath, { force: true });
      }
    });
  });

  describe("listCodeNodeSourceFiles", () => {
    it("lists all source files from approved workflows", () => {
      const files = listCodeNodeSourceFiles();
      expect(Array.isArray(files)).toBe(true);
      expect(files.every((f) => typeof f === "string")).toBe(true);
      expect(files.every((f) => f.includes("/"))).toBe(true);
      expect(files.every((f) => f.endsWith(".js"))).toBe(true);
    });

    it("returns sorted file list for consistency", () => {
      const files = listCodeNodeSourceFiles();
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    it("includes files from call-agent workflow", () => {
      const files = listCodeNodeSourceFiles();
      const callAgentFiles = files.filter((f) => f.startsWith("call-agent/"));
      expect(callAgentFiles.length).toBeGreaterThan(0);
    });

    it("includes files from marketing-pipeline workflow", () => {
      const files = listCodeNodeSourceFiles();
      const mpFiles = files.filter((f) => f.startsWith("marketing-pipeline/"));
      expect(mpFiles.length).toBeGreaterThan(0);
    });
  });

  describe("real workflow source files", () => {
    it("successfully loads call-agent source files", () => {
      const files = listCodeNodeSourceFiles();
      const callAgentFiles = files.filter((f) => f.startsWith("call-agent/"));

      expect(callAgentFiles.length).toBeGreaterThan(0);

      // Test files that don't need tokens
      const noTokenFiles = ["store-input-context", "parse-agent-config", "unsupported-provider-error"];
      for (const nodeSlug of noTokenFiles) {
        if (callAgentFiles.some((f) => f.includes(nodeSlug))) {
          const source = loadCodeNodeSource({
            workflowSlug: "call-agent",
            nodeSlug,
          });
          expect(typeof source).toBe("string");
          expect(source.length).toBeGreaterThan(0);
        }
      }
    });

    it("successfully loads marketing-pipeline source files", () => {
      const files = listCodeNodeSourceFiles();
      const mpFiles = files.filter((f) => f.startsWith("marketing-pipeline/"));

      expect(mpFiles.length).toBeGreaterThan(0);

      for (const file of mpFiles.slice(0, 2)) {
        const fileName = file.replace("marketing-pipeline/", "").replace(".js", "");
        const source = loadCodeNodeSource({
          workflowSlug: "marketing-pipeline",
          nodeSlug: fileName,
        });
        expect(typeof source).toBe("string");
        expect(source.length).toBeGreaterThan(0);
      }
    });

    it("call-agent assemble-prompt source renders with tokens", () => {
      const source = loadCodeNodeSource({
        workflowSlug: "call-agent",
        nodeSlug: "assemble-prompt",
        tokens: {
          DEFAULT_TEMPERATURE: 0.7,
          DEFAULT_MAX_OUTPUT_TOKENS: 2000,
          DEFAULT_PROVIDER: "openai",
          DEFAULT_MODEL: "gpt-4",
        },
      });
      expect(source).not.toContain("@@");
      expect(source).toContain("0.7");
      expect(source).toContain("2000");
    });

    it("marketing-pipeline extract-task-fields source renders with tokens", () => {
      const source = loadCodeNodeSource({
        workflowSlug: "marketing-pipeline",
        nodeSlug: "extract-task-fields",
        tokens: {
          FIELD_ID_CRITERIOS_DE_ACEITE: "cf_001",
          FIELD_ID_AGENT_ID: "cf_002",
          FIELD_ID_EDITORIAL_DOC_URL: "cf_003",
          DEFAULT_AGENT_ID: "default-agent",
          DEFAULT_MODEL: "gpt-4",
        },
      });
      expect(source).not.toContain("@@");
      expect(source).toContain("cf_001");
    });
  });
});
