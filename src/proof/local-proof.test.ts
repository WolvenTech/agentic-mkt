import { describe, expect, it } from "vitest";
import {
  runLocalProofChecks,
  validateStagedStatuses,
  validateStagePageNames,
  validatePointerCommentFormat,
  validateBlockerCommentFormat,
  validateStagedDefinitions,
  validateStageGates,
} from "./local-proof.js";

describe("local-proof.ts — staged configuration validation", () => {
  describe("validateStagedStatuses()", () => {
    it("passes when required statuses are defined", () => {
      const result = validateStagedStatuses();
      expect(result.passed).toBe(true);
      expect(result.row.status).toBe("pass");
      expect(result.row.id).toBe("LOCAL-STATUSES");
    });

    it("includes all required statuses in details", () => {
      const result = validateStagedStatuses();
      const details = result.row.details;
      expect(details).toContain("backlog");
      expect(details).toContain("investigate");
      expect(details).toContain("brief review");
      expect(details).toContain("write");
      expect(details).toContain("content review");
      expect(details).toContain("format");
      expect(details).toContain("final review");
      expect(details).toContain("publish");
      expect(details).toContain("Closed");
    });
  });

  describe("validateStagePageNames()", () => {
    it("passes when all required page names are defined", () => {
      const result = validateStagePageNames();
      expect(result.passed).toBe(true);
      expect(result.row.status).toBe("pass");
      expect(result.row.id).toBe("LOCAL-PAGES");
    });

    it("includes expected and actual page names", () => {
      const result = validateStagePageNames();
      expect(result.row.details).toContain("Brief");
      expect(result.row.details).toContain("Argument");
      expect(result.row.details).toContain("Final Draft");
    });
  });

  describe("validatePointerCommentFormat()", () => {
    it("passes pointer comment format validation", () => {
      const result = validatePointerCommentFormat();
      expect(result.passed).toBe(true);
      expect(result.row.status).toBe("pass");
      expect(result.row.id).toBe("LOCAL-POINTER-FORMAT");
    });

    it("specifies the required prefix in details", () => {
      const result = validatePointerCommentFormat();
      expect(result.row.details).toContain("[CQ-AI]");
    });
  });

  describe("validateBlockerCommentFormat()", () => {
    it("passes blocker comment format validation", () => {
      const result = validateBlockerCommentFormat();
      expect(result.passed).toBe(true);
      expect(result.row.status).toBe("pass");
      expect(result.row.id).toBe("LOCAL-BLOCKER-FORMAT");
    });

    it("specifies the required prefix in details", () => {
      const result = validateBlockerCommentFormat();
      expect(result.row.details).toContain("[CQ-BLOCKER]");
    });
  });

  describe("validateStagedDefinitions()", () => {
    it("passes when all required stages are defined", () => {
      const result = validateStagedDefinitions();
      expect(result.passed).toBe(true);
      expect(result.row.status).toBe("pass");
      expect(result.row.id).toBe("LOCAL-STAGES");
    });

    it("includes all three stages", () => {
      const result = validateStagedDefinitions();
      expect(result.row.details).toContain("investigate");
      expect(result.row.details).toContain("write");
      expect(result.row.details).toContain("format");
    });
  });

  describe("validateStageGates()", () => {
    it("passes when stage gates route correctly", () => {
      const result = validateStageGates();
      expect(result.passed).toBe(true);
      expect(result.row.status).toBe("pass");
      expect(result.row.id).toBe("LOCAL-GATES");
    });

    it("validates gate sequence: investigate -> brief review", () => {
      const result = validateStageGates();
      if (result.passed) {
        expect(result.row.details).toBe("All stage gates route correctly");
      }
    });

    it("validates gate sequence: write -> content review", () => {
      const result = validateStageGates();
      expect(result.passed).toBe(true);
    });

    it("validates gate sequence: format -> final review", () => {
      const result = validateStageGates();
      expect(result.passed).toBe(true);
    });
  });

  describe("runLocalProofChecks()", () => {
    it("returns array of evidence rows", () => {
      const result = runLocalProofChecks();
      expect(Array.isArray(result.rows)).toBe(true);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it("includes rows from all checks", () => {
      const result = runLocalProofChecks();
      const ids = result.rows.map((r) => r.id);
      expect(ids).toContain("LOCAL-STATUSES");
      expect(ids).toContain("LOCAL-PAGES");
      expect(ids).toContain("LOCAL-POINTER-FORMAT");
      expect(ids).toContain("LOCAL-BLOCKER-FORMAT");
      expect(ids).toContain("LOCAL-STAGES");
      expect(ids).toContain("LOCAL-GATES");
    });

    it("marks all checks as passing when configuration is valid", () => {
      const result = runLocalProofChecks();
      expect(result.passed).toBe(true);
      expect(result.rows.every((r) => r.status === "pass")).toBe(true);
    });

    it("produces valid evidence rows with required fields", () => {
      const result = runLocalProofChecks();
      for (const row of result.rows) {
        expect(row.id).toBeDefined();
        expect(row.status).toBeDefined();
        expect(["pass", "fail"]).toContain(row.status);
        expect(row.check).toBeDefined();
        expect(row.details).toBeDefined();
      }
    });
  });
});
