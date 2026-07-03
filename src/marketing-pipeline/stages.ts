/**
 * Stage definitions for the Content Quality Pipeline.
 * Defines the deterministic metadata for routing, Doc pages, and human gates.
 * See ADR-005 and ADR-006 for architectural context.
 */

export type StageName = "investigate" | "write" | "format";
export type PageName = "Brief" | "Argument" | "Final Draft";
export type HumanGate = "backlog" | "brief review" | "content review" | "final review";
export const AGENT_WORKING_TAG = "agent-working";
export const AGENT_BLOCKED_TAG = "agent-blocked";

/**
 * Canonical stage definition mapping each stage to its agent, page, and gate transitions.
 * Later tasks use these helpers to route to the correct agent and validate next_gate values.
 */
export interface StageDefinition {
  stage: StageName;
  agent_id: string;
  page_name: PageName;
  previous_gate: HumanGate;
  next_gate: HumanGate;
}

export const INVESTIGATE_STAGE: StageDefinition = {
  stage: "investigate",
  agent_id: "investigative-brief",
  page_name: "Brief",
  previous_gate: "backlog",
  next_gate: "brief review",
};

export const WRITE_STAGE: StageDefinition = {
  stage: "write",
  agent_id: "long-form-argument",
  page_name: "Argument",
  previous_gate: "brief review",
  next_gate: "content review",
};

export const FORMAT_STAGE: StageDefinition = {
  stage: "format",
  agent_id: "linkedin-format",
  page_name: "Final Draft",
  previous_gate: "content review",
  next_gate: "final review",
};

export const ALL_STAGES: StageDefinition[] = [INVESTIGATE_STAGE, WRITE_STAGE, FORMAT_STAGE];

/**
 * Lookup a stage definition by its stage identifier.
 * Throws descriptive error if stage is unknown.
 */
export function getStageDefinition(stageName: string): StageDefinition {
  const stage = ALL_STAGES.find((s) => s.stage === stageName);
  if (!stage) {
    throw new Error(
      `Unknown stage '${stageName}'. Expected one of: ${ALL_STAGES.map((s) => s.stage).join(", ")}`
    );
  }
  return stage;
}

/**
 * Return true when stageName matches a known stage identifier.
 */
export function isKnownStage(stageName: unknown): stageName is StageName {
  if (typeof stageName !== "string") return false;
  return ALL_STAGES.some((s) => s.stage === stageName);
}
