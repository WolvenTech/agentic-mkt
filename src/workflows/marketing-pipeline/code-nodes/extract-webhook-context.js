// n8n Code node source - wrapped in IIFE for parsing
(function() {
const raw = $input.first().json;
const payload = (raw.body && raw.body.history_items) ? raw.body : raw;
const items = payload.history_items || [];
const first = items[0] || {};
function statusValue(value) {
  if (value !== null && typeof value === 'object') return String(value.status ?? '').trim().toLowerCase();
  return String(value ?? '').trim().toLowerCase();
}
return [{
  json: {
    task_id: String(payload.task_id ?? ''),
    webhook_id: String(payload.webhook_id ?? ''),
    history_item_id: String(first.id ?? ''),
    list_id: String(first.parent_id ?? ''),
    received_at_ms: Date.now(),
    ingress_mode: String(raw.ingress_mode ?? payload.ingress_mode ?? 'first_draft'),
    transition_before: statusValue(first.before),
    transition_after: statusValue(first.after),
  },
}];
}());
