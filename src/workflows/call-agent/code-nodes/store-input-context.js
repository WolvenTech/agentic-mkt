// n8n Code node source - wrapped in IIFE for parsing
(function() {
const item = $input.first().json;
return [{
  json: {
    ...item,
    _started_at_ms: Date.now(),
    task_id: item.task_id ?? item.task_title ?? 'isolation-test',
  },
}];
}());
