// n8n Code node source - wrapped in IIFE for parsing
(function() {
const commentData = $('Format Pointer Comment').first().json;
const nextGate =  $('Execute Call Agent').first().json.next_gate || '';

const STATUS_MAP = {
  'brief review': 'Brief Review',
  'content review': 'Content Review',
  'final review': 'Final Review',
};

const statusValue = STATUS_MAP[nextGate];
if (!statusValue) {
  throw new Error(`Invalid next_gate '${nextGate}'. Expected one of: brief review, content review, final review`);
}

return [{
  json: {
    ...commentData,
    status_to_set: statusValue,
  },
}];
}());
