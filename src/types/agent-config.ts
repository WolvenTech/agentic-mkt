import type { AgentOutput } from "./call-agent-io.js";

export interface AgentConfig {
  id: string;
  provider: string;
  model: string;
  temperature: number;
  max_output_tokens: number;
  skills: string[];
  output_schema: Record<keyof AgentOutput, string>;
}
