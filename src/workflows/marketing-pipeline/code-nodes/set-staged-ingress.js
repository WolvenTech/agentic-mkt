// n8n Code node source - wrapped in IIFE for parsing
(function() {
const item = $input.first().json;
return [{
  json: {
    ...item,
    ingress_mode: "first_draft",
  },
}];
}());
