// n8n Code node source - wrapped in IIFE for parsing
(function() {
const FIELD_IDS = {
  criterios_de_aceite: @@FIELD_ID_CRITERIOS_DE_ACEITE@@,
  agent_id: @@FIELD_ID_AGENT_ID@@,
  editorial_doc_url: @@FIELD_ID_EDITORIAL_DOC_URL@@,
  default_agent_id: @@DEFAULT_AGENT_ID@@,
};

const STAGE_TO_AGENT = {
  investigate: 'investigative-brief',
  write: 'long-form-argument',
  format: 'linkedin-format',
};

function readCustomField(task, fieldId) {
  if (!fieldId || fieldId === '<TBD>') return '';
  const fields = task.custom_fields || [];
  const match = fields.find((field) => String(field.id) === String(fieldId));
  if (!match || match.value === null || match.value === undefined) return '';
  if (typeof match.value === 'object') {
    return String(match.value.value ?? match.value.name ?? match.value.label ?? '');
  }
  return String(match.value);
}

const task = $input.first().json;
const webhook = $('Extract Webhook Context').first().json;
const stage = webhook.stage || null;
const agentId = stage && STAGE_TO_AGENT[stage] ? STAGE_TO_AGENT[stage] : (readCustomField(task, FIELD_IDS.agent_id).trim() || FIELD_IDS.default_agent_id);

return [{
  json: {
    task_id: String(task.id ?? webhook.task_id ?? ''),
    stage: stage,
    agent_id: agentId,
    task_title: String(task.name ?? ''),
    task_description: String(task.description ?? task.text_content ?? ''),
    criterios_de_aceite: readCustomField(task, FIELD_IDS.criterios_de_aceite),
    editorial_doc_url: readCustomField(task, FIELD_IDS.editorial_doc_url),
    workspace_id: String(task.team_id ?? ''),
    ingress_mode: String(webhook.ingress_mode ?? 'first_draft'),
    model: @@DEFAULT_MODEL@@,
  },
}];
}());
