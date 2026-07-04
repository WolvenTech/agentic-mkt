// n8n Code node source - wrapped in IIFE for parsing
(function() {
const STAGE_TO_PAGE_NAME = {
  investigate: 'Brief',
  write: 'Argument',
  format: 'Final Draft',
};

const fields = $('Doc Ready').first().json;
const stage = fields.stage;
const pageName = STAGE_TO_PAGE_NAME[stage];
if (!pageName) {
  throw new Error(`Unknown stage '${stage}'. Expected one of: ${Object.keys(STAGE_TO_PAGE_NAME).join(', ')}`);
}

const pages = $json.pages || [];
const existing = pages.find((page) => page.name === pageName);

return [{
  json: {
    workspace_id: fields.workspace_id,
    doc_id: fields.doc_id,
    stage,
    page_name: pageName,
    page_id: existing?.id ?? '',
  },
}];
}());
