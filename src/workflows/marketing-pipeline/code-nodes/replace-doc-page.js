// n8n Code node source - wrapped in IIFE for parsing
(function() {
const fields = $('Format Pointer Comment').first().json;

return [{
  json: {
    ...fields,
    page_replaced: true,
    operation: 'page_replaced',
  },
}];
}());
