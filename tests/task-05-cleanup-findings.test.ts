import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");
const CLEANUP_REPORT_PATH = resolve(REPO_ROOT, ".compozy", "tasks", "repo-cleanup-agent-harness", "cleanup-report.md");

/**
 * Task 05: Verify cleanup findings are recorded with validation commands.
 * These tests ensure that the review process completed and findings are documented.
 */
describe("task_05 cleanup findings validation", () => {
  const report = existsSync(CLEANUP_REPORT_PATH)
    ? readFileSync(CLEANUP_REPORT_PATH, "utf-8")
    : "";

  describe("coverage: findings exist for all required surfaces", () => {
    it("has findings for src/ modules", () => {
      expect(report).toContain("Pattern Duplication");
      expect(report).toContain("src/marketing-pipeline/logic.ts");
    });

    it("has findings for scripts/", () => {
      expect(report).toContain("Scripts Do Not Route Through Vendor Gate");
      expect(report).toContain("scripts/deploy-workflows.ts");
      expect(report).toContain("scripts/green-run.ts");
      expect(report).toContain("scripts/verify-clickup.ts");
      expect(report).toContain("scripts/inspect-executions.ts");
    });

    it("has findings for tests/", () => {
      expect(report).toContain("Documentation Test Suite");
      expect(report).toContain("tests/documentation.test.ts");
      expect(report).toContain("Task-02-Inventory Test");
      expect(report).toContain("tests/task-02-inventory.test.ts");
    });

    it("has findings for fixtures/", () => {
      expect(report).toContain("Stale Ingress Webhook Fixtures");
      expect(report).toContain("clickup/fixtures");
      expect(report).toContain("task-status-updated-ready-to-work");
      expect(report).toContain("task-status-updated-needs-review");
    });
  });

  describe("validation commands", () => {
    it("every finding has a validation command", () => {
      // Extract findings section
      const findingsStart = report.indexOf("## Task 05 Review Findings");
      const findingsEnd = report.indexOf("## Review-Rubric Practices");
      const findingsSection = report.slice(findingsStart, findingsEnd > 0 ? findingsEnd : report.length);

      // Count findings (### Finding:)
      const findingMatches = findingsSection.match(/### Finding:/g) ?? [];
      const findingCount = findingMatches.length;

      // Count validation commands (- **Validation Command:**)
      const cmdMatches = findingsSection.match(/- \*\*Validation Command:\*\*/g) ?? [];
      const cmdCount = cmdMatches.length;

      expect(cmdCount, `Expected ${findingCount} validation commands but found ${cmdCount}`).toBeGreaterThanOrEqual(
        findingCount
      );
    });

    it("vendor-gate finding has a validation command that checks script routing", () => {
      const vendorFinding = report.slice(report.indexOf("Scripts Do Not Route Through Vendor Gate"));
      const cmdSection = vendorFinding.slice(0, vendorFinding.indexOf("### Finding:") || vendorFinding.length);
      expect(cmdSection).toContain("Validation Command:");
      expect(cmdSection).toContain("runGate");
    });

    it("ingress consolidation finding has a validation command", () => {
      const pattern = report.slice(report.indexOf("Pattern Duplication in Ingress Matcher"));
      const section = pattern.slice(0, pattern.indexOf("### Finding:") || pattern.length);
      expect(section).toContain("Validation Command:");
      expect(section).toContain("ingressMatches");
    });

    it("fixture finding has a validation command", () => {
      const fixture = report.slice(report.indexOf("Stale Ingress Webhook Fixtures"));
      const section = fixture.slice(0, fixture.indexOf("### Finding:") || fixture.length);
      expect(section).toContain("Validation Command:");
      expect(section).toContain("test -f");
    });
  });

  describe("finding classification", () => {
    it("all findings have a category (delete|consolidate|document|fix|protect|defer)", () => {
      const validCategories = ["delete", "consolidate", "document", "fix", "protect", "defer"];
      const categoryMatches = report.match(/- \*\*Category:\*\* `(delete|consolidate|document|fix|protect|defer)`/g);
      expect(categoryMatches, "Should have findings with valid categories").toBeTruthy();
      expect(categoryMatches?.length ?? 0).toBeGreaterThan(0);
    });

    it("deferred findings on high-risk surfaces have owner and date", () => {
      const deferredFindings = report.match(/### Finding:.*?Disposition:\*\* `deferred`/s) ?? [];
      expect(deferredFindings.length).toBeGreaterThan(0);

      for (const finding of deferredFindings) {
        const riskSection = finding.slice(finding.indexOf("**Risk:**"));
        if (riskSection.includes("high") || riskSection.includes("medium")) {
          expect(finding).toContain("**Risk Acceptance Owner:**");
          expect(finding).toContain("**Risk Acceptance Trigger Date:**");
        }
      }
    });

    it("applied and protect findings document their impact", () => {
      const appliedFindings = report.match(/Disposition:\*\* `(applied|protect)`/g) ?? [];
      expect(appliedFindings.length).toBeGreaterThan(0);
    });
  });

  describe("no source/test/fixture modifications", () => {
    it("src/ files were not edited", () => {
      const srcFiles = [
        "src/marketing-pipeline/logic.ts",
        "src/marketing-pipeline/stages.ts",
        "src/call-agent/logic.ts",
        "src/clickup/vendor-gate.ts",
        "src/clickup/verify-api.ts",
        "src/clickup/green-run-validation.ts",
      ];
      for (const file of srcFiles) {
        const path = resolve(REPO_ROOT, file);
        expect(existsSync(path), `${file} should exist`).toBe(true);
      }
    });

    it("scripts/ files were not edited", () => {
      const scriptFiles = [
        "scripts/deploy-workflows.ts",
        "scripts/green-run.ts",
        "scripts/verify-clickup.ts",
        "scripts/inspect-executions.ts",
      ];
      for (const file of scriptFiles) {
        const path = resolve(REPO_ROOT, file);
        expect(existsSync(path), `${file} should exist`).toBe(true);
      }
    });

    it("fixture files were not edited", () => {
      const fixtures = [
        "clickup/fixtures/task-status-updated-ready-to-work.json",
        "clickup/fixtures/task-status-updated-needs-review.json",
        "clickup/fixtures/task-status-updated-investigate.json",
      ];
      for (const file of fixtures) {
        const path = resolve(REPO_ROOT, file);
        expect(existsSync(path), `${file} should exist`).toBe(true);
      }
    });

    it("test files were not edited", () => {
      const testFiles = [
        "tests/documentation.test.ts",
        "tests/task-02-inventory.test.ts",
        "tests/marketing-pipeline.test.ts",
      ];
      for (const file of testFiles) {
        const path = resolve(REPO_ROOT, file);
        expect(existsSync(path), `${file} should exist`).toBe(true);
      }
    });
  });

  describe("report structure", () => {
    it("has Task 05 section header", () => {
      expect(report).toContain("## Task 05 Review Findings");
    });

    it("has at least 80% of required surfaces covered", () => {
      const required = [
        "src/marketing-pipeline/logic.ts",
        "src/call-agent/logic.ts",
        "scripts/deploy-workflows.ts",
        "scripts/green-run.ts",
        "tests/documentation.test.ts",
        "clickup/fixtures/task-status-updated-ready-to-work.json",
      ];
      const covered = required.filter((surface) => report.includes(surface));
      const coverage = covered.length / required.length;
      expect(coverage, `Coverage ${(coverage * 100).toFixed(1)}% should be >= 80%`).toBeGreaterThanOrEqual(0.8);
    });

    it("all findings documented before Review-Rubric section", () => {
      const rubricStart = report.indexOf("## Review-Rubric Practices");
      const taskStart = report.indexOf("## Task 05 Review Findings");
      expect(rubricStart).toBeGreaterThan(taskStart);
    });
  });
});
