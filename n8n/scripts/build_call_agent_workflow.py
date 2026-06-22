#!/usr/bin/env python3
"""Generate n8n Call Agent sub-workflow export JSON."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "n8n" / "workflows" / "call-agent-subworkflow.json"

HARDCODED_TEST_INPUT = {
    "agent_id": "linkedin-writer",
    "task_title": "Launch post for Q3 product update",
    "task_description": "Announce the new dashboard feature for marketing leads.",
    "criterios_de_aceite": "- Mention the dashboard\n- CTA to sign up\n- Under 300 words",
}


def _id() -> str:
    return str(uuid.uuid4())


PARSE_AGENT_OUTPUT_JS = r"""
const REQUIRED_KEYS = ['deliverable_markdown', 'resumo', 'autochecagem'];
const startedAt = $('Store Input Context').first().json._started_at_ms ?? Date.now();
const input = $('Store Input Context').first().json;
const agentId = input.agent_id ?? 'unknown';
const taskId = input.task_id ?? input.task_title ?? 'unknown';
const executionId = $execution.id;

function stripFences(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  if (lines[0].startsWith('```')) lines.shift();
  if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
  return lines.join('\n').trim();
}

function extractGeminiText(item) {
  const json = item.json ?? {};
  const content = json.content;
  if (content && typeof content === 'object' && Array.isArray(content.parts) && content.parts[0]?.text) {
    return String(content.parts[0].text);
  }
  for (const key of ['text', 'output', 'message']) {
    if (typeof json[key] === 'string') return json[key];
  }
  return JSON.stringify(json);
}

const rawResponse = extractGeminiText($input.first());
let parseSuccess = false;
let result;

try {
  const cleaned = stripFences(rawResponse);
  const parsed = JSON.parse(cleaned);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected JSON object');
  }
  const missing = REQUIRED_KEYS.filter((key) => !(key in parsed));
  if (missing.length) throw new Error(`Missing required keys: ${missing.join(', ')}`);
  const invalid = REQUIRED_KEYS.filter((key) => typeof parsed[key] !== 'string' || !parsed[key].trim());
  if (invalid.length) throw new Error(`Empty or non-string values for: ${invalid.join(', ')}`);
  result = {
    deliverable_markdown: parsed.deliverable_markdown,
    resumo: parsed.resumo,
    autochecagem: parsed.autochecagem,
  };
  parseSuccess = true;
} catch (error) {
  result = {
    error: `Failed to parse AgentOutput: ${error.message}`,
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
""".strip()


def build_workflow() -> dict:
    nodes = [
        {
            "parameters": {"inputSource": "passthrough"},
            "id": _id(),
            "name": "When Executed by Another Workflow",
            "type": "n8n-nodes-base.executeWorkflowTrigger",
            "typeVersion": 1.1,
            "position": [0, 300],
        },
        {
            "parameters": {},
            "id": _id(),
            "name": "Manual Trigger (Isolation Test)",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [0, 100],
        },
        {
            "parameters": {
                "mode": "raw",
                "jsonOutput": json.dumps(HARDCODED_TEST_INPUT),
                "options": {},
            },
            "id": _id(),
            "name": "Hardcoded Test Input",
            "type": "n8n-nodes-base.set",
            "typeVersion": 3.4,
            "position": [240, 100],
        },
        {
            "parameters": {
                "jsCode": """
const item = $input.first().json;
return [{
  json: {
    ...item,
    _started_at_ms: Date.now(),
    task_id: item.task_id ?? item.task_title ?? 'isolation-test',
  },
}];
""".strip(),
            },
            "id": _id(),
            "name": "Store Input Context",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [480, 200],
        },
        {
            "parameters": {
                "resource": "file",
                "operation": "get",
                "owner": {
                    "__rl": True,
                    "mode": "name",
                    "value": "rafiti052",
                },
                "repository": {
                    "__rl": True,
                    "mode": "name",
                    "value": "agentic-mkt",
                },
                "filePath": "=agents/{{ $json.agent_id }}.json",
                "asBinaryProperty": False,
            },
            "id": _id(),
            "name": "Fetch Agent Config",
            "type": "n8n-nodes-base.github",
            "typeVersion": 1.1,
            "position": [720, 200],
            "retryOnFail": True,
            "maxTries": 2,
            "waitBetweenTries": 1000,
            "credentials": {
                "githubApi": {"id": "GITHUB_CREDENTIAL_ID", "name": "GitHub agentic-mkt (read-only PAT)"},
            },
        },
        {
            "parameters": {
                "jsCode": """
const input = $('Store Input Context').first().json;
const github = $input.first().json;
const encoded = github.content;
if (!encoded) {
  return [{ json: { error: 'GitHub agent config fetch failed', raw_response: JSON.stringify(github) } }];
}
const decoded = Buffer.from(String(encoded).replace(/\\n/g, ''), 'base64').toString('utf8');
const agentConfig = JSON.parse(decoded);
const skills = Array.isArray(agentConfig.skills) ? agentConfig.skills : [];
return skills.map((skill) => ({
  json: {
    ...input,
    agent_config: agentConfig,
    skill,
    skill_path: `agents/skills/${skill}.md`,
  },
}));
""".strip(),
            },
            "id": _id(),
            "name": "Parse Agent Config",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [960, 200],
        },
        {
            "parameters": {
                "resource": "file",
                "operation": "get",
                "owner": {
                    "__rl": True,
                    "mode": "name",
                    "value": "rafiti052",
                },
                "repository": {
                    "__rl": True,
                    "mode": "name",
                    "value": "agentic-mkt",
                },
                "filePath": "={{ $json.skill_path }}",
                "asBinaryProperty": False,
            },
            "id": _id(),
            "name": "Fetch Skill Markdown",
            "type": "n8n-nodes-base.github",
            "typeVersion": 1.1,
            "position": [1200, 200],
            "retryOnFail": True,
            "maxTries": 2,
            "waitBetweenTries": 1000,
            "credentials": {
                "githubApi": {"id": "GITHUB_CREDENTIAL_ID", "name": "GitHub agentic-mkt (read-only PAT)"},
            },
        },
        {
            "parameters": {
                "jsCode": """
const items = $input.all();
const base = items[0]?.json ?? {};
const agentConfig = base.agent_config;
const skillContents = {};
for (const item of items) {
  const skill = item.json.skill;
  const encoded = item.json.content;
  if (!skill || !encoded) continue;
  skillContents[skill] = Buffer.from(String(encoded).replace(/\\n/g, ''), 'base64').toString('utf8');
}
const schema = agentConfig.output_schema ?? {};
const example = {
  deliverable_markdown: schema.deliverable_markdown ?? 'Full LinkedIn post draft in markdown',
  resumo: schema.resumo ?? '2-3 sentence summary of the draft',
  autochecagem: schema.autochecagem ?? 'Bullet list validating draft against acceptance criteria',
};
const skillBlocks = (agentConfig.skills ?? []).map((skill) => {
  const body = (skillContents[skill] ?? '').trim();
  return `## Skill: ${skill}\\n${body}`;
}).join('\\n\\n');
const systemPrompt = [
  '# Agent Role',
  `You are the \\`${agentConfig.id}\\` marketing worker agent.`,
  '',
  '# Skills',
  skillBlocks,
  '',
  '# Required Output Format',
  'Respond with JSON only. Do not wrap the JSON in markdown code fences.',
  'Required keys and semantics:',
  JSON.stringify(example, null, 2),
].join('\\n');
const userMessage = [
  '# Task Title',
  base.task_title ?? '',
  '',
  '# Task Description',
  base.task_description ?? '',
  '',
  '# Critérios de Aceite',
  base.criterios_de_aceite ?? '',
].join('\\n');
return [{
  json: {
    ...base,
    agent_config: agentConfig,
    skill_contents: skillContents,
    system_prompt: systemPrompt,
    user_message: userMessage,
    temperature: agentConfig.temperature ?? 0.7,
    max_output_tokens: agentConfig.max_output_tokens ?? 1024,
    provider: agentConfig.provider ?? 'google',
    model: agentConfig.model ?? 'gemini-2.5-flash',
  },
}];
""".strip(),
            },
            "id": _id(),
            "name": "Assemble Prompt",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1440, 200],
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"version": 2, "leftValue": "", "caseSensitive": True, "typeValidation": "strict"},
                    "combinator": "and",
                    "conditions": [
                        {
                            "id": _id(),
                            "leftValue": "={{ $json.provider }}",
                            "rightValue": "google",
                            "operator": {"type": "string", "operation": "equals"},
                        }
                    ],
                },
                "options": {},
            },
            "id": _id(),
            "name": "Route Provider",
            "type": "n8n-nodes-base.if",
            "typeVersion": 2.2,
            "position": [1680, 200],
        },
        {
            "parameters": {
                "resource": "text",
                "operation": "message",
                "modelId": {
                    "__rl": True,
                    "mode": "id",
                    "value": "={{ 'models/' + ($json.model || 'gemini-2.5-flash').replace(/^models\\//, '') }}",
                },
                "messages": {
                    "values": [
                        {
                            "content": "={{ $json.user_message }}",
                            "role": "user",
                        }
                    ]
                },
                "simplify": True,
                "jsonOutput": True,
                "options": {
                    "systemMessage": "={{ $json.system_prompt }}",
                    "temperature": "={{ $json.temperature ?? 0.7 }}",
                    "maxOutputTokens": "={{ $json.max_output_tokens ?? 1024 }}",
                },
            },
            "id": _id(),
            "name": "Google Gemini",
            "type": "@n8n/n8n-nodes-langchain.googleGemini",
            "typeVersion": 1.2,
            "position": [1920, 120],
            "credentials": {
                "googlePalmApi": {"id": "GEMINI_CREDENTIAL_ID", "name": "Google Gemini API"},
            },
        },
        {
            "parameters": {
                "jsCode": PARSE_AGENT_OUTPUT_JS,
            },
            "id": _id(),
            "name": "Parse Agent Output",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2160, 120],
        },
        {
            "parameters": {
                "jsCode": """
return [{
  json: {
    error: `Unsupported provider: ${$json.provider ?? 'unknown'}. M1 supports google only.`,
    raw_response: JSON.stringify($json),
  },
}];
""".strip(),
            },
            "id": _id(),
            "name": "Unsupported Provider Error",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1920, 320],
        },
    ]

    connections = {
        "When Executed by Another Workflow": {
            "main": [[{"node": "Store Input Context", "type": "main", "index": 0}]]
        },
        "Manual Trigger (Isolation Test)": {
            "main": [[{"node": "Hardcoded Test Input", "type": "main", "index": 0}]]
        },
        "Hardcoded Test Input": {
            "main": [[{"node": "Store Input Context", "type": "main", "index": 0}]]
        },
        "Store Input Context": {
            "main": [[{"node": "Fetch Agent Config", "type": "main", "index": 0}]]
        },
        "Fetch Agent Config": {
            "main": [[{"node": "Parse Agent Config", "type": "main", "index": 0}]]
        },
        "Parse Agent Config": {
            "main": [[{"node": "Fetch Skill Markdown", "type": "main", "index": 0}]]
        },
        "Fetch Skill Markdown": {
            "main": [[{"node": "Assemble Prompt", "type": "main", "index": 0}]]
        },
        "Assemble Prompt": {
            "main": [[{"node": "Route Provider", "type": "main", "index": 0}]]
        },
        "Route Provider": {
            "main": [
                [{"node": "Google Gemini", "type": "main", "index": 0}],
                [{"node": "Unsupported Provider Error", "type": "main", "index": 0}],
            ]
        },
        "Google Gemini": {
            "main": [[{"node": "Parse Agent Output", "type": "main", "index": 0}]]
        },
    }

    return {
        "name": "Call Agent",
        "nodes": nodes,
        "connections": connections,
        "pinData": {
            "When Executed by Another Workflow": [
                {"json": HARDCODED_TEST_INPUT},
            ]
        },
        "active": False,
        "settings": {"executionOrder": "v1"},
        "versionId": _id(),
        "meta": {
            "templateCredsSetupCompleted": False,
            "instanceId": "agentic-mkt-call-agent-export",
        },
        "tags": [{"name": "marketing-pipeline"}],
    }


def main() -> None:
    workflow = build_workflow()
    OUTPUT_PATH.write_text(json.dumps(workflow, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
