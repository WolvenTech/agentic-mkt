return [{
  json: {
    error: `Unsupported provider: ${$json.provider ?? 'unknown'}. M1 routes openai (and legacy google) to GPT.`,
    raw_response: JSON.stringify($json),
  },
}];
