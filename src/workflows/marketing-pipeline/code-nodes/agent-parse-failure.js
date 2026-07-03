// n8n Code node source - wrapped in IIFE for parsing
(function() {
const output = $input.first().json;
const taskFields = $('Extract Task Fields').first().json;
console.log(JSON.stringify({
  task_id: taskFields.task_id,
  agent_id: taskFields.agent_id,
  execution_id: $execution.id,
  parse_success: false,
  error: output.error ?? 'Agent returned error envelope',
}));
throw new Error(`Call Agent failed: ${output.error ?? 'unknown error'}`);
}());
