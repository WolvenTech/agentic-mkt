// n8n Code node source - wrapped in IIFE for parsing
(function() {
const agentOutput = $('Execute Call Agent').first().json;
const hasBlocker = Boolean(agentOutput.blocker_question);
return [{
  json: {
    ...agentOutput,
    has_blocker: hasBlocker,
  },
}];
}());
