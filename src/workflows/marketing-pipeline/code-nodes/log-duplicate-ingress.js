// n8n Code node source - wrapped in IIFE for parsing
(function() {
const context = $input.first().json;
const before = String(context.transition_before ?? '').trim().toLowerCase();
const after = String(context.transition_after ?? '').trim().toLowerCase();
const transition = before || after ? `${before}->${after}` : '';
const record = {
  event: 'ingress_skipped',
  task_id: context.task_id,
  webhook_id: context.webhook_id,
  history_item_id: context.history_item_id,
  transition,
  reason: 'duplicate_history_item',
};
console.log(JSON.stringify(record));
return [{ json: record }];
}());
