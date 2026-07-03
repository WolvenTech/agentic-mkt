// n8n Code node source - wrapped in IIFE for parsing
(function() {
let fields = $input.first().json;

if (!fields.doc_id || !fields.workspace_id) {
  try {
    const persisted = $('Persist Doc Pointer').first().json;
    if (persisted.doc_id && persisted.workspace_id) {
      fields = persisted;
    }
  } catch (err) {
    // Persist Doc Pointer only runs on the new-Doc branch; existing-Doc branch already has the fields.
  }
}

if (!fields.doc_id || !fields.workspace_id) {
  throw new Error('Doc Ready missing doc_id or workspace_id after Doc resolution');
}

return [{ json: fields }];
}());
