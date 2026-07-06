import { describe, expect, it } from "vitest";
import {
  loadFieldMapping,
  stagedStatusName,
  statusName,
  validateAllStageStatuses,
  validateStageStatus,
} from "./logic.js";
import {
  ALL_STAGES,
  FORMAT_STAGE,
  INVESTIGATE_STAGE,
  WRITE_STAGE,
  getStageDefinition,
  isKnownStage,
} from "./stages.js";
import type { FieldMapping } from "../types/field-mapping.js";

function fixtureFieldMapping(): FieldMapping {
  const mapping = loadFieldMapping();
  mapping.custom_fields.criterios_de_aceite!.clickup_field_id = "cf_criterios_001";
  mapping.custom_fields.agent_id!.clickup_field_id = "cf_agent_id_001";
  mapping.custom_fields.editorial_doc_url!.clickup_field_id = "cf_editorial_doc_url_001";
  return mapping;
}

describe("stage definitions and status mapping", () => {
  const mapping = fixtureFieldMapping();

  it("exports stage definitions from stages module", () => {
    expect(INVESTIGATE_STAGE.stage).toBe("investigate");
    expect(WRITE_STAGE.stage).toBe("write");
    expect(FORMAT_STAGE.stage).toBe("format");
    expect(ALL_STAGES).toHaveLength(3);
    expect(ALL_STAGES).toEqual([INVESTIGATE_STAGE, WRITE_STAGE, FORMAT_STAGE]);
  });

  it("each stage resolves to the expected page name and gates", () => {
    // Investigate: backlog -> Brief -> brief review
    expect(INVESTIGATE_STAGE).toMatchObject({
      stage: "investigate",
      agent_id: "investigative-brief",
      page_name: "Brief",
      previous_gate: "backlog",
      next_gate: "brief review",
    });

    // Write: brief review -> Argument -> content review
    expect(WRITE_STAGE).toMatchObject({
      stage: "write",
      agent_id: "long-form-argument",
      page_name: "Argument",
      previous_gate: "brief review",
      next_gate: "content review",
    });

    // Format: content review -> Final Draft -> final review
    expect(FORMAT_STAGE).toMatchObject({
      stage: "format",
      agent_id: "linkedin-format",
      page_name: "Final Draft",
      previous_gate: "content review",
      next_gate: "final review",
    });
  });

  it("getStageDefinition resolves all three stages by name", () => {
    const investigate = getStageDefinition("investigate");
    expect(investigate.stage).toBe("investigate");
    expect(investigate.agent_id).toBe("investigative-brief");

    const write = getStageDefinition("write");
    expect(write.stage).toBe("write");
    expect(write.agent_id).toBe("long-form-argument");

    const format = getStageDefinition("format");
    expect(format.stage).toBe("format");
    expect(format.agent_id).toBe("linkedin-format");
  });

  it("getStageDefinition throws descriptive error for unknown stage", () => {
    expect(() => getStageDefinition("invalid-stage")).toThrow(
      "Unknown stage 'invalid-stage'. Expected one of: investigate, write, format"
    );
  });

  it("isKnownStage validates stage identifier type and value", () => {
    expect(isKnownStage("investigate")).toBe(true);
    expect(isKnownStage("write")).toBe(true);
    expect(isKnownStage("format")).toBe(true);

    expect(isKnownStage("unknown")).toBe(false);
    expect(isKnownStage(null)).toBe(false);
    expect(isKnownStage(undefined)).toBe(false);
    expect(isKnownStage(123)).toBe(false);
  });

  it("stagedStatusName resolves status names from field mapping", () => {
    expect(stagedStatusName(mapping, "investigate")).toBe("investigate");
    expect(stagedStatusName(mapping, "brief_review")).toBe("brief review");
    expect(stagedStatusName(mapping, "write")).toBe("write");
    expect(stagedStatusName(mapping, "content_review")).toBe("content review");
    expect(stagedStatusName(mapping, "format")).toBe("format");
    expect(stagedStatusName(mapping, "final_review")).toBe("final review");
  });

  it("stagedStatusName throws descriptive error for missing status", () => {
    const badMapping: FieldMapping = {
      clickup_list_id: "test",
      custom_fields: {},
      statuses: { ready: "ready" },
    };

    expect(() => stagedStatusName(badMapping, "investigate")).toThrow(
      "Missing status 'investigate' in field mapping"
    );
    expect(() => stagedStatusName(badMapping, "investigate")).toThrow(
      "Available statuses:"
    );
  });

  it("validateStageStatus rejects missing staged status keys with descriptive error", () => {
    const badMapping: FieldMapping = {
      clickup_list_id: "test",
      custom_fields: {},
      statuses: { ready: "ready", writing: "writing" },
    };

    expect(() => validateStageStatus(badMapping, "investigate")).toThrow(
      "Missing staged status 'investigate' in field mapping"
    );
    expect(() => validateStageStatus(badMapping, "investigate")).toThrow(
      "Staged statuses required: investigate, brief_review, write, content_review, format, final_review"
    );
  });

  it("validateAllStageStatuses verifies all required statuses are present", () => {
    // Valid mapping should not throw
    expect(() => validateAllStageStatuses(mapping)).not.toThrow();

    // Missing statuses should throw
    const partialMapping: FieldMapping = {
      clickup_list_id: "test",
      custom_fields: {},
      statuses: {
        investigate: "investigate",
        brief_review: "brief review",
        // missing write, content_review, format, final_review
      },
    };

    expect(() => validateAllStageStatuses(partialMapping)).toThrow(
      "Missing staged statuses in field mapping: write, content_review, format, final_review"
    );
  });

  it("stage definitions work with fixture field mapping for integration testing", () => {
    validateAllStageStatuses(mapping);

    const stages = [INVESTIGATE_STAGE, WRITE_STAGE, FORMAT_STAGE];
    for (const stage of stages) {
      expect(statusName(mapping, stage.stage)).toBe(
        stage.stage === "investigate"
          ? "investigate"
          : stage.stage === "write"
            ? "write"
            : "format"
      );
    }
  });

  it("stage matrix covers all three stages with deterministic routing", () => {
    // Verify the chain: backlog -> investigate -> brief review -> write -> content review -> format -> final review
    const chain = [
      { gate: "backlog", stage: "investigate", next: "brief review" },
      { gate: "brief review", stage: "write", next: "content review" },
      { gate: "content review", stage: "format", next: "final review" },
    ];

    for (const { gate, stage, next } of chain) {
      const stagedef = ALL_STAGES.find((s) => s.stage === stage);
      expect(stagedef?.previous_gate).toBe(gate);
      expect(stagedef?.next_gate).toBe(next);
    }
  });
});
