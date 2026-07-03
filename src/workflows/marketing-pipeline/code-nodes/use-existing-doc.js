// n8n Code node source - wrapped in IIFE for parsing
(function() {
const fields = $('Extract Task Fields').first().json;
const pointer = String(fields.editorial_doc_url ?? '').trim();

if (!pointer) {
  throw new Error('Editorial Doc Url custom field is empty. Expected a Doc ID or ClickUp Doc URL.');
}

// Normalize: extract Doc ID from ClickUp Doc URL or use bare ID
let docId;
if (pointer.includes('doc.clickup.com')) {
  const match = pointer.match(/\/p\/h\/([a-z0-9]+)/i);
  if (match && match[1]) {
    docId = match[1];
  } else {
    throw new Error(`Failed to extract Doc ID from ClickUp Doc URL: ${pointer}`);
  }
} else if (pointer.includes('app.clickup.com')) {
  const match = pointer.match(/\/dc\/([a-z0-9-]+)/i);
  if (match && match[1]) {
    docId = match[1];
  } else {
    throw new Error(`Failed to extract Doc ID from ClickUp App URL: ${pointer}`);
  }
} else if (/^[a-z0-9-]+$/i.test(pointer)) {
  docId = pointer;
} else {
  throw new Error(`Invalid Doc pointer format: ${pointer}. Expected ClickUp Doc URL or bare Doc ID`);
}

return [{
  json: {
    workspace_id: fields.workspace_id,
    doc_id: docId,
    doc_created: false,
    operation: 'use_existing_doc',
    stage: fields.stage,
  },
}];
}());
