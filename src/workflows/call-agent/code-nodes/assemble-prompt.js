// n8n Code node source - wrapped in IIFE for parsing
(function() {
const items = $input.all();
const base = items[0]?.json ?? {};
const agentConfig = base.agent_config;
if (!agentConfig) {
  return [{ json: { error: 'Missing agent_config after Merge Agent Files Fetch', raw_response: JSON.stringify(base) } }];
}
const skillContents = {};
const referenceContents = {};
for (const item of items) {
  const skill = item.json.skill;
  const reference = item.json.reference;
  const encoded = item.json.content;
  if (!encoded) continue;
  const decoded = Buffer.from(String(encoded).replace(/\n/g, ''), 'base64').toString('utf8');
  if (skill) {
    skillContents[skill] = decoded;
  } else if (reference) {
    referenceContents[reference] = decoded;
  }
}
const schema = agentConfig.output_schema ?? {};
const example = schema;
const skillBlocks = (agentConfig.skills ?? []).map((skill) => {
  const body = (skillContents[skill] ?? '').trim();
  return `## Skill: ${skill}\n${body}`;
}).join('\n\n');
const systemPromptLines = [
  '# Agent Role',
  `You are the \`${agentConfig.id}\` marketing worker agent.`,
  '',
  '# Skills',
  skillBlocks,
  '',
];
const references = agentConfig.references ?? [];
if (references.length > 0) {
  const referenceBlocks = references.map((ref) => {
    const body = (referenceContents[ref] ?? '').trim();
    return `## Reference: ${ref}\n${body}`;
  }).join('\n\n');
  systemPromptLines.push('# References', referenceBlocks, '');
}
systemPromptLines.push(
  '# Required Output Format',
  'Respond with JSON only. Do not wrap the JSON in markdown code fences.',
  'Required keys and semantics:',
  JSON.stringify(example, null, 2),
);
const systemPrompt = systemPromptLines.join('\n');
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
    reference_contents: referenceContents,
    system_prompt: systemPrompt,
    user_message: userMessage,
    temperature: agentConfig.temperature ?? @@DEFAULT_TEMPERATURE@@,
    max_output_tokens: agentConfig.max_output_tokens ?? @@DEFAULT_MAX_OUTPUT_TOKENS@@,
    provider: agentConfig.provider ?? @@DEFAULT_PROVIDER@@,
    model: agentConfig.model ?? @@DEFAULT_MODEL@@,
  },
}];
}());
