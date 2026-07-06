/**
 * AgentConfig defines a marketing agent's instructions, model parameters, and artifact references.
 *
 * - `references` is an optional array of GitHub file paths (e.g., "agents/references/editorial-brief.md")
 *   for stage agents. These files are fetched alongside skills and included in prompt assembly
 *   (see ADR-006: Use Stage-Aware Agent Contracts and Reference Files).
 *
 * - Stage agent configs (investigate, write, format) include references for role-specific
 *   templates and examples (see ADR-003: Role-Focused Self-Contained Stage Agents).
 */
export interface AgentConfig {
  id: string;
  provider: string;
  model: string;
  temperature: number;
  max_output_tokens: number;
  skills: string[];
  references?: string[];
  output_schema: Record<string, string>;
}
