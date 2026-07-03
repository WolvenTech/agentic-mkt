// n8n Code node source - wrapped in IIFE for parsing
(function() {
const DEFAULT_MODEL = @@DEFAULT_MODEL@@;

const fields = $('Extract Task Fields').first().json;
const priorDoc = $('Read Current Page').first()?.json;
const feedbackFields = $('Extract Latest Lead Feedback').first()?.json || {};

const stage = fields.stage || 'investigate';
const priorArtifact = priorDoc?.page_content || '';
const leadFeedback = feedbackFields.lead_feedback || undefined;

return [{
  json: {
    agent_id: fields.agent_id,
    stage,
    task_title: fields.task_title,
    task_description: fields.task_description,
    criterios_de_aceite: fields.criterios_de_aceite,
    prior_stage_artifact: priorArtifact || undefined,
    lead_feedback: leadFeedback,
    model: fields.model || DEFAULT_MODEL,
    task_id: fields.task_id,
  },
}];
}());
