export interface CallAgentInput {
  agent_id: string;
  task_title: string;
  task_description: string;
  criterios_de_aceite: string;
}

export interface AgentOutput {
  deliverable_markdown: string;
  resumo: string;
  autochecagem: string;
}

export type AgentErrorEnvelope = {
  error: string;
  raw_response: string;
};

export type ParseResult = AgentOutput | AgentErrorEnvelope;

export function isAgentError(result: ParseResult): result is AgentErrorEnvelope {
  return "error" in result;
}
