// n8n Code node source - wrapped in IIFE for parsing
(function() {
const docData = $('Doc Created').first().json;
const taskFields = $('Extract Task Fields').first().json;
const docUrl = `https://app.clickup.com/${docData.workspace_id}/v/dc/${docData.doc_id}`;

// Create the custom field update payload for ClickUp API v2 custom field endpoint.
return [{
  json: {
    task_id: taskFields.task_id,
    doc_id: docData.doc_id,
    editorial_doc_url: docUrl,
    workspace_id: docData.workspace_id,
    editorial_doc_url_field_id: @@FIELD_ID_EDITORIAL_DOC_URL@@,
    doc_created: true,
    operation: 'persist_doc_pointer',
    stage: docData.stage,
  },
}];
}());
