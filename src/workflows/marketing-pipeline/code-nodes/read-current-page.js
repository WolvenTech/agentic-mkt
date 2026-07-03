// n8n Code node source - wrapped in IIFE for parsing
(function() {
const content = $json.content;
if (content === undefined) {
  throw new Error('Page fetched but response did not include content');
}

return [{ json: { page_content: content } }];
}());
