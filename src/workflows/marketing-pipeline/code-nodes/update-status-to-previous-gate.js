// n8n Code node source - wrapped in IIFE for parsing
(function() {
const taskFields = $('Extract Task Fields').first().json;
const stage = taskFields.stage || 'investigate';

const STAGE_TO_PREVIOUS_GATE = {
  investigate: 'backlog',
  write: 'brief review',
  format: 'content review',
};

const GATE_STATUS_MAP = {
  backlog: 'Backlog',
  'brief review': 'Brief Review',
  'content review': 'Content Review',
};

const previousGate = STAGE_TO_PREVIOUS_GATE[stage];
if (!previousGate) {
  throw new Error(`Invalid stage '${stage}'. Expected one of: investigate, write, format`);
}

const statusValue = GATE_STATUS_MAP[previousGate];
if (!statusValue) {
  throw new Error(`Invalid previous_gate '${previousGate}'. Expected one of: backlog, brief review, content review`);
}

return [{
  json: {
    task_id: taskFields.task_id,
    status_to_set: statusValue,
    previous_gate: previousGate,
  },
}];
}());
