// n8n Code node source - wrapped in IIFE for parsing
(function() {
const fields = $('Find Stage Page').first().json;
if (!$json.id) {
  throw new Error(`Page '${fields.page_name}' created but response did not include id`);
}

return [{
  json: {
    ...fields,
    page_id: $json.id,
  },
}];
}());
