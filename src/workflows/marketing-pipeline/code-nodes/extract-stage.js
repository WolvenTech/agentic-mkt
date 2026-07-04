// n8n Code node source - wrapped in IIFE for parsing
(function() {
const raw = $input.first().json;
const payload = (raw.body && raw.body.history_items) ? raw.body : raw;

const items = payload.history_items || [];
const item = items[0];
if (!item || item.field !== 'status') {
  return [{ json: { ...payload, stage: null } }];
}

const after = item.after;
const status = (after !== null && typeof after === 'object') ? String(after.status ?? '').trim().toLowerCase() : String(after ?? '').trim().toLowerCase();

const investigateMatch = status === @@STATUS_INVESTIGATE@@;
const writeMatch = status === @@STATUS_WRITE@@;
const formatMatch = status === @@STATUS_FORMAT@@;

let stage = null;
if (investigateMatch) stage = 'investigate';
else if (writeMatch) stage = 'write';
else if (formatMatch) stage = 'format';

return [{
  json: {
    ...payload,
    stage: stage,
  },
}];
}());
