// n8n Code node source - wrapped in IIFE for parsing
(function() {
const fields = $('Extract Task Fields').first().json;
const record = {
  event: 'empty_feedback_guidance',
  task_id: fields.task_id,
};
console.log(JSON.stringify(record));
return [{ json: record }];
}());
