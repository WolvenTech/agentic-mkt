// n8n Code node source - wrapped in IIFE for parsing
(function() {
const fields = $('Extract Task Fields').first().json;
const commentText = [
  '## Revision feedback needed',
  '',
  'I did not find actionable lead feedback in the comment thread, so I did not start an automated revision.',
  '',
  'Please add a comment with the specific changes needed, then move the task back to Needs Review.',
].join('\n');
return [{ json: { task_id: fields.task_id, comment_text: commentText } }];
}());
