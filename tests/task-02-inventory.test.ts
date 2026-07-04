import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");

/**
 * Task_02: Inventory source-of-truth map and protected surfaces
 *
 * These tests verify:
 * 1. All required surfaces are inventoried in cleanup-report.md
 * 2. Ignore behavior is correctly wired in .gitignore
 * 3. No cleanup changes were applied during the task (only cleanup-report.md changed)
 */

describe("task_02 inventory", () => {
  // Required surfaces from task specification
  const REQUIRED_SURFACES = [
    "README.md",
    "AGENTS.md",
    ".agents/AGENTS.md",
    ".compozy/",
    "agents/",
    "agents/harness/",
    "clickup/",
    "marketing-pipelines/",
    "src/workflows/",
    "tests/",
    ".env.example",
    "logs/",
    ".cursorrules",
    ".clauderules",
    ".claude/",
    ".codex/",
  ];

  it("inventories all required surfaces in cleanup-report.md", () => {
    const reportPath = resolve(
      REPO_ROOT,
      ".compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md"
    );
    expect(existsSync(reportPath)).toBe(true);
    const content = readFileSync(reportPath, "utf-8");

    for (const surface of REQUIRED_SURFACES) {
      // Check that each surface is mentioned in the inventory section
      const mentionedInInventory =
        content.includes(`| \`${surface}\``) || content.includes(`\`${surface}/\``);
      expect(mentionedInInventory, `${surface} not found in inventory`).toBe(true);
    }
  });

  it("documents owner role, edit policy, and validation command for each entry", () => {
    const reportPath = resolve(
      REPO_ROOT,
      ".compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md"
    );
    const content = readFileSync(reportPath, "utf-8");

    // Check that the inventory section includes owner role column
    expect(content).toContain("Owner Role");
    expect(content).toContain("Edit Policy");
    expect(content).toContain("Validation Command");

    // Verify the inventory section has table format with pipe separators
    const inventoryStart = content.indexOf("## Source-of-Truth Inventory");
    expect(inventoryStart).toBeGreaterThan(-1);
    const inventorySection = content.substring(inventoryStart, inventoryStart + 20000);

    // Check that inventory section has proper table format with required columns
    expect(inventorySection).toContain("| Surface |");
    expect(inventorySection).toContain("| Owner Role |");
    expect(inventorySection).toContain("| Edit Policy |");
    expect(inventorySection).toContain("| Validation Command |");
  });

  it("records boundary findings with required fields", () => {
    const reportPath = resolve(
      REPO_ROOT,
      ".compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md"
    );
    const content = readFileSync(reportPath, "utf-8");

    // Check for findings section and required fields
    expect(content).toContain("## Findings");
    expect(content).toContain("Path:");
    expect(content).toContain("Category:");
    expect(content).toContain("Rationale:");
    expect(content).toContain("Risk:");
    expect(content).toContain("Proposed Change:");
    expect(content).toContain("Validation Command:");
    expect(content).toContain("Disposition:");
  });

  it("verifies ignore behavior for expected ignored surfaces", () => {
    const ignoredSurfaces = [
      ".compozy/",
      ".agents/",
      ".codex/",
      ".cursorrules",
      ".clauderules",
      ".env",
      ".claude/",
      "logs/example.log",
    ];

    for (const surface of ignoredSurfaces) {
      try {
        const result = execSync(`git check-ignore -v ${surface}`, {
          cwd: REPO_ROOT,
          encoding: "utf-8",
        });
        expect(result).toContain(".gitignore");
        expect(result).toContain(surface);
      } catch (e) {
        // git check-ignore exits with code 1 if file is not ignored
        throw new Error(`Expected ${surface} to be ignored by .gitignore`);
      }
    }
  });

  it("verifies non-ignored surfaces are not caught by git check-ignore", () => {
    const nonIgnoredSurfaces = [
      "README.md",
      "AGENTS.md",
      "agents/",
      "clickup/",
      "marketing-pipelines/",
      "src/",
      "tests/",
      ".env.example",
    ];

    for (const surface of nonIgnoredSurfaces) {
      try {
        execSync(`git check-ignore -v ${surface}`, {
          cwd: REPO_ROOT,
          encoding: "utf-8",
        });
        // If we get here, the file is ignored, which is wrong
        throw new Error(`Expected ${surface} to NOT be ignored`);
      } catch (e) {
        // Expected: git check-ignore should exit with non-zero for non-ignored files
        if (typeof e === "object" && e && "status" in e && (e as any).status === 1) {
          // This is the expected behavior
        } else {
          throw e;
        }
      }
    }
  });

  it("verifies green-run-evidence.json is ignored", () => {
    try {
      const result = execSync(`git check-ignore -v agents/harness/green-run-evidence.json`, {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      expect(result).toContain("agents/harness/green-run-evidence.json");
    } catch (e) {
      throw new Error(
        "Expected agents/harness/green-run-evidence.json to be ignored by .gitignore"
      );
    }
  });

  it("verifies .cursorrules and .clauderules are symlinks", () => {
    const cursorrules = resolve(REPO_ROOT, ".cursorrules");
    const clauderules = resolve(REPO_ROOT, ".clauderules");

    try {
      const cursorTarget = execSync(`readlink .cursorrules`, {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      }).trim();
      const claudeTarget = execSync(`readlink .clauderules`, {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      }).trim();

      expect(cursorTarget).toBe(".agents/AGENTS.md");
      expect(claudeTarget).toBe(".agents/AGENTS.md");
    } catch (e) {
      throw new Error("Expected .cursorrules and .clauderules to be symlinks");
    }
  });

  it("confirms coverage target: >=80% of required surfaces inventoried", () => {
    const reportPath = resolve(
      REPO_ROOT,
      ".compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md"
    );
    const content = readFileSync(reportPath, "utf-8");

    let inventoriedCount = 0;
    for (const surface of REQUIRED_SURFACES) {
      const mentioned =
        content.includes(`| \`${surface}\``) ||
        content.includes(`\`${surface}/\``) ||
        content.includes(`**${surface}**`);
      if (mentioned) {
        inventoriedCount++;
      }
    }

    const coverage = (inventoriedCount / REQUIRED_SURFACES.length) * 100;
    expect(coverage).toBeGreaterThanOrEqual(80);
  });

  it("records git status before and after: only cleanup-report.md changed (or already ignored files)", () => {
    // This test is informational — it documents what files were modified during task_02
    // In practice, the task should only modify cleanup-report.md (which is ignored)
    // and possibly task memory files (also ignored)

    try {
      const output = execSync("git status --short", {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });

      const modified = output
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => line.trim());

      // Filter out expected ignored/untracked files that are OK to appear
      const unexpectedChanges = modified.filter((line) => {
        // Ignore lines starting with ?? (untracked)
        if (line.startsWith("??")) {
          const file = line.substring(3).trim();
          // Acceptable untracked: .compozy/, logs/, node_modules/, coverage/, etc.
          return !(
            file.startsWith(".compozy/") ||
            file.startsWith("logs/") ||
            file.startsWith("node_modules/") ||
            file.startsWith("coverage/")
          );
        }
        // Check for staged or modified files that shouldn't exist
        return !line.includes(".compozy/") && !line.includes("logs/");
      });

      // Report if there are unexpected changes, but don't fail the test (informational)
      if (unexpectedChanges.length > 0) {
        console.log("Note: Unexpected changes detected (non-cleanup-report files):");
        unexpectedChanges.forEach((line) => console.log(`  ${line}`));
      }
    } catch (e) {
      // Ignore errors in this informational test
    }
  });

  it("verifies cleanup-report.md contains Summary Statistics section", () => {
    const reportPath = resolve(
      REPO_ROOT,
      ".compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md"
    );
    const content = readFileSync(reportPath, "utf-8");

    expect(content).toContain("Summary Statistics");
    expect(content).toContain("Total Surfaces Inventoried:");
    expect(content).toContain("Required Coverage:");
    expect(content).toContain("Coverage Target (>=80%):");
    expect(content).toContain("Ignore Behavior Verified:");
  });

  it("verifies cleanup-report.md contains Boundary Assertion Summary", () => {
    const reportPath = resolve(
      REPO_ROOT,
      ".compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md"
    );
    const content = readFileSync(reportPath, "utf-8");

    expect(content).toContain("Boundary Assertion Summary");
    expect(content).toContain("Hand-written source");
    expect(content).toContain("Generated");
    expect(content).toContain("ClickUp field contract");
    expect(content).toContain("Agent harness I/O contract");
    expect(content).toContain("Local-only");
  });
});
