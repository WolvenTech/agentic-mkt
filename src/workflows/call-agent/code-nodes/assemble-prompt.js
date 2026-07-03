// n8n Code node source - wrapped in IIFE for parsing
(function() {
const items = $input.all();
const base = items[0]?.json ?? {};
const agentConfig = base.agent_config;
if (!agentConfig) {
  return [{ json: { error: 'Missing agent_config after Merge Skill Fetch', raw_response: JSON.stringify(base) } }];
}
const skillContents = {};
for (const item of items) {
  const skill = item.json.skill;
  const encoded = item.json.content;
  if (!skill || !encoded) continue;
  skillContents[skill] = Buffer.from(String(encoded).replace(/\n/g, ''), 'base64').toString('utf8');
}
const schema = agentConfig.output_schema ?? {};
const example = {
  deliverable_markdown: schema.deliverable_markdown ?? 'Full LinkedIn post draft in markdown',
  resumo: schema.resumo ?? '2-3 sentence summary of the draft',
  autochecagem: schema.autochecagem ?? 'Bullet list validating draft against acceptance criteria',
};
const skillBlocks = (agentConfig.skills ?? []).map((skill) => {
  const body = (skillContents[skill] ?? '').trim();
  return `## Skill: ${skill}\n${body}`;
}).join('\n\n');
const systemPrompt = [
  '# Agent Role',
  `You are the \`${agentConfig.id}\` marketing worker agent.`,
  '',
  '# Skills',
  skillBlocks,
  '',
  '# Required Output Format',
  'Respond with JSON only. Do not wrap the JSON in markdown code fences.',
  'Required keys and semantics:',
  JSON.stringify(example, null, 2),
].join('\n');
const userMessage = [
  '# Task Title',
  base.task_title ?? '',
  '',
  '# Task Description',
  base.task_description ?? '',
  '',
  '# Critérios de Aceite',
  base.criterios_de_aceite ?? '',
].join('\n');
return [{
  json: {
    ...base,
    agent_config: agentConfig,
    skill_contents: skillContents,
    system_prompt: systemPrompt,
    user_message: userMessage,
    temperature: agentConfig.temperature ?? @@DEFAULT_TEMPERATURE@@,
    max_output_tokens: agentConfig.max_output_tokens ?? @@DEFAULT_MAX_OUTPUT_TOKENS@@,
    provider: agentConfig.provider ?? @@DEFAULT_PROVIDER@@,
    model: agentConfig.model ?? @@DEFAULT_MODEL@@,
  },
}];
}());
