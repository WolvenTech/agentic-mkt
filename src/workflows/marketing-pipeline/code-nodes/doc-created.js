// n8n Code node source - wrapped in IIFE for parsing
(function() {
const fields = $('Extract Task Fields').first().json;
if (!$json.id) {
  throw new Error('Doc created but response did not include id');
}

return [{
  json: {
    workspace_id: fields.workspace_id,
    doc_id: $json.id,
    doc_created: true,
    operation: 'created_doc',
    stage: fields.stage,
  },
}];
}());
