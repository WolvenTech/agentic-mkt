// n8n Code node source - wrapped in IIFE for parsing
(function() {
const agentOutput = $('Execute Call Agent').first().json;
const taskFields = $('Extract Task Fields').first().json;

const artifact = (agentOutput.artifact_markdown ?? '').trim();
const firstLine = artifact.split('\n')[0].replace(/^#+\s*/, '').trim();
const whatChanged = firstLine || '(artifact updated)';

const commentText = [
  '[CQ-AI] Staged artifact updated',
  '',
  `**What changed:** ${whatChanged}`,
  '',
  '**Summary:**',
  `${agentOutput.resumo ?? ''}`,
  '',
  '**Self-check:**',
  `${agentOutput.self_check ?? ''}`,
  '',
  `**Next:** Moving to ${agentOutput.next_gate ?? 'next review'}`,
].join('\n');

return [{
  json: {
    task_id: taskFields.task_id,
    comment_text: commentText,
    artifact_markdown: agentOutput.artifact_markdown,
    next_gate: agentOutput.next_gate,
  },
}];
}());
