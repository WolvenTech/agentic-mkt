const raw = $input.first().json;
const payload = (raw.body && raw.body.history_items) ? raw.body : raw;
const items = payload.history_items || [];
const first = items[0] || {};
const targetStatusKey = String(raw.target_status_key ?? 'ready');

function statusValue(value) {
  if (value !== null && typeof value === 'object') return String(value.status ?? '').trim().toLowerCase();
  return String(value ?? '').trim().toLowerCase();
}

const before = statusValue(first.before);
const after = statusValue(first.after);
const transition = before || after ? `${before}->${after}` : '';

let reason = targetStatusKey === 'needs_review' ? 'not_entering_needs_review' : 'not_entering_ready';
if (!items.length) reason = 'no_history_items';
else if (first.field !== 'status') reason = 'field_not_status';

const record = {
  event: 'ingress_skipped',
  task_id: String(payload.task_id ?? ''),
  webhook_id: String(payload.webhook_id ?? ''),
  history_item_id: String(first.id ?? ''),
  transition,
  reason,
};
console.log(JSON.stringify(record));
return [{ json: record }];
