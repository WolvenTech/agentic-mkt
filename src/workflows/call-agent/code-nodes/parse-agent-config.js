const input = $('Store Input Context').first().json;
const github = $input.first().json;
const encoded = github.content;
if (!encoded) {
  return [{ json: { error: 'GitHub agent config fetch failed', raw_response: JSON.stringify(github) } }];
}
const decoded = Buffer.from(String(encoded).replace(/\n/g, ''), 'base64').toString('utf8');
const agentConfig = JSON.parse(decoded);
const skills = Array.isArray(agentConfig.skills) ? agentConfig.skills : [];
return skills.map((skill) => ({
  json: {
    ...input,
    agent_config: agentConfig,
    skill,
    skill_path: `agents/skills/${skill}.md`,
  },
}));
