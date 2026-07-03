const item = $input.first().json;
return [{ json: { ...item, target_status_key: 'needs_review' } }];
