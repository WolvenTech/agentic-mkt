// n8n Code node source - wrapped in IIFE for parsing
(function() {
const agentOutput = $('Execute Call Agent').first().json;
const taskFields = $('Extract Task Fields').first().json;

const artifact = agentOutput.artifact_markdown;

// Validate artifact_markdown exists and is non-empty
if (!artifact || typeof artifact !== 'string' || artifact.trim().length === 0) {
  throw new Error(
    `Staged success output missing or empty artifact_markdown. ` +
    `Cannot proceed with Doc replacement or status advancement. ` +
    `Task: ${taskFields.task_id}, Stage: ${taskFields.stage}`
  );
}

return [{
  json: {
    ...agentOutput,
    artifact_markdown: artifact.trim(),
  },
}];
}());
