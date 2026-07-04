// n8n Code node source - wrapped in IIFE for parsing
(function() {
const REQUIRED_KEYS = @@REQUIRED_OUTPUT_KEYS@@;
const REQUIRED_STAGE_KEYS = @@REQUIRED_STAGE_OUTPUT_KEYS@@;
const STAGE_DEFINITIONS = {
  investigate: { next_gate: 'brief review' },
  write: { next_gate: 'content review' },
  format: { next_gate: 'final review' },
};
const startedAt = $('Store Input Context').first().json._started_at_ms ?? Date.now();
const input = $('Store Input Context').first().json;
const agentId = input.agent_id ?? 'unknown';
const taskId = input.task_id ?? input.task_title ?? 'unknown';
const executionId = $execution.id;
const agentConfig = $('Assemble Prompt').first().json.agent_config ?? {};
const isStaged = typeof (agentConfig.output_schema ?? {}).stage === 'string';

function stripFences(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  if (lines[0].startsWith('```')) lines.shift();
  if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
  return lines.join('\n').trim();
}

function extractOpenAIText(item) {
  const json = item.json ?? {};
  const chunks = [];
  const output = json.output;
  if (Array.isArray(output)) {
    for (const message of output) {
      const content = message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type !== 'output_text' || block.text == null) continue;
        if (typeof block.text === 'string') chunks.push(block.text);
        else if (typeof block.text === 'object') chunks.push(JSON.stringify(block.text));
      }
    }
  }
  if (chunks.length) return chunks.join('');
  const choice = Array.isArray(json.choices) ? json.choices[0] : null;
  if (choice?.message?.content && typeof choice.message.content === 'string') {
    return choice.message.content;
  }
  for (const key of ['text', 'message']) {
    if (typeof json[key] === 'string') return json[key];
  }
  return JSON.stringify(json);
}

const rawResponse = extractOpenAIText($input.first());
let parseSuccess = false;
let result;

try {
  const cleaned = stripFences(rawResponse);
  const parsed = JSON.parse(cleaned);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected JSON object');
  }

  if (isStaged) {
    const missing = REQUIRED_STAGE_KEYS.filter((key) => !(key in parsed));
    if (missing.length) throw new Error(`Missing required keys: ${missing.join(', ')}`);

    const stage = parsed.stage;
    if (!stage || !STAGE_DEFINITIONS[stage]) {
      throw new Error(`Unknown stage '${String(stage)}'. Expected one of: investigate, write, format`);
    }
    const stageDefinition = STAGE_DEFINITIONS[stage];

    const requiredStringFields = ['artifact_markdown', 'resumo', 'self_check'];
    const empty = requiredStringFields.filter((key) => typeof parsed[key] !== 'string' || !parsed[key].trim());
    if (empty.length) throw new Error(`Empty or non-string values for: ${empty.join(', ')}`);

    const nextGate = parsed.next_gate;
    if (nextGate !== stageDefinition.next_gate) {
      throw new Error(`Invalid next_gate '${String(nextGate)}' for stage '${stage}'. Expected '${stageDefinition.next_gate}'`);
    }

    if (parsed.blocker_question !== undefined) {
      if (typeof parsed.blocker_question !== 'string' || !parsed.blocker_question.trim()) {
        throw new Error('blocker_question must be a non-empty string when present');
      }
    }

    result = {
      stage: parsed.stage,
      artifact_markdown: parsed.artifact_markdown,
      resumo: parsed.resumo,
      self_check: parsed.self_check,
      next_gate: parsed.next_gate,
    };
    if (parsed.blocker_question) {
      result.blocker_question = parsed.blocker_question;
    }
  } else {
    const missing = REQUIRED_KEYS.filter((key) => !(key in parsed));
    if (missing.length) throw new Error(`Missing required keys: ${missing.join(', ')}`);
    const invalid = REQUIRED_KEYS.filter((key) => typeof parsed[key] !== 'string' || !parsed[key].trim());
    if (invalid.length) throw new Error(`Empty or non-string values for: ${invalid.join(', ')}`);
    result = {
      deliverable_markdown: parsed.deliverable_markdown,
      resumo: parsed.resumo,
      autochecagem: parsed.autochecagem,
    };
  }
  parseSuccess = true;
} catch (error) {
  result = {
    error: `Failed to parse ${isStaged ? 'StageAgentOutput' : 'AgentOutput'}: ${error.message}`,
    raw_response: rawResponse,
  };
}

const latencyMs = Date.now() - startedAt;
console.log(JSON.stringify({
  task_id: taskId,
  agent_id: agentId,
  execution_id: executionId,
  latency_ms: latencyMs,
  parse_success: parseSuccess,
}));

return [{ json: result }];
}());
