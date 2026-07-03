// n8n Code node source - wrapped in IIFE for parsing
(function() {
const agentOutput = $('Execute Call Agent').first().json;
const taskFields = $('Extract Task Fields').first().json;
const stage = taskFields.stage || 'unknown';

const STAGE_NAMES = {
  investigate: 'investigation phase',
  write: 'argument phase',
  format: 'formatting phase',
};

const stageName = STAGE_NAMES[stage] || stage;

const commentText = [
  '[CQ-BLOCKER] Cannot proceed to next stage',
  '',
  `**Stage:** ${stageName}`,
  '',
  '**Question for you:**',
  `${agentOutput.blocker_question ?? ''}`,
  '',
  'Please provide the information requested above, then move the task back to this stage.',
].join('\n');

return [{
  json: {
    task_id: taskFields.task_id,
    comment_text: commentText,
    blocker_question: agentOutput.blocker_question,
    stage: taskFields.stage,
  },
}];
}());
