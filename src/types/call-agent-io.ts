export interface CallAgentInput {
  agent_id: string;
  task_title: string;
  task_description: string;
  criterios_de_aceite: string;
}

export interface StageInput {
  agent_id: string;
  stage: "investigate" | "write" | "format";
  task_title: string;
  task_description: string;
  criterios_de_aceite: string;
  prior_stage_artifact?: string;
  lead_feedback?: string;
  model: string;
}

// Stage-aware agent output contract for the Content Quality Pipeline.
// See ADR-006 for architectural context.
export interface StageAgentOutput {
  stage: "investigate" | "write" | "format";
  artifact_markdown: string;
  resumo: string;
  self_check: string;
  next_gate: "brief review" | "content review" | "final review";
  blocker_question?: string;
}

export type StageErrorEnvelope = {
  error: string;
  raw_response: string;
};

export type StageParsedResult = StageAgentOutput | StageErrorEnvelope;

export function isStageError(result: StageParsedResult): result is StageErrorEnvelope {
  return "error" in result;
}
