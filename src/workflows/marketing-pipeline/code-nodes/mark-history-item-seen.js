// n8n Code node source - wrapped in IIFE for parsing
(function() {
const staticData = $getWorkflowStaticData('global');
staticData.seenHistoryItems = staticData.seenHistoryItems || {};
const key = String($json.history_item_id ?? '');
if (key) staticData.seenHistoryItems[key] = Date.now();
return [{ json: $json }];
}());
