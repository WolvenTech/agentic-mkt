"""Call Agent sub-workflow logic mirrored for unit tests and Code node parity."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

REQUIRED_OUTPUT_KEYS = ("deliverable_markdown", "resumo", "autochecagem")
GITHUB_REPO_OWNER = "rafiti052"
GITHUB_REPO_NAME = "agentic-mkt"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_OUTPUT_TOKENS = 1024


def agent_config_path(agent_id: str) -> str:
    return f"agents/{agent_id}.json"


def skill_path(skill_name: str) -> str:
    return f"agents/skills/{skill_name}.md"


def decode_github_file_content(github_response: dict[str, Any]) -> str:
    """Decode GitHub file API response (base64 content field) to UTF-8 text."""
    content = github_response.get("content")
    if not isinstance(content, str):
        raise ValueError("GitHub file response missing base64 content")
    normalized = content.replace("\n", "")
    return base64.b64decode(normalized).decode("utf-8")


def strip_json_fences(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def extract_gemini_text(response: dict[str, Any]) -> str:
    """Extract model text from n8n Google Gemini node simplified output."""
    content = response.get("content")
    if isinstance(content, dict):
        parts = content.get("parts", [])
        if parts and isinstance(parts[0], dict) and "text" in parts[0]:
            return str(parts[0]["text"])
    for key in ("text", "output", "message"):
        value = response.get(key)
        if isinstance(value, str):
            return value
    return json.dumps(response)


def error_envelope(message: str, raw_response: str) -> dict[str, str]:
    return {"error": message, "raw_response": raw_response}


def parse_agent_output(raw_response: str) -> dict[str, str]:
    """Return AgentOutput on success or error envelope on parse/validation failure."""
    try:
        cleaned = strip_json_fences(raw_response)
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            return error_envelope("Expected JSON object", raw_response)

        missing = [key for key in REQUIRED_OUTPUT_KEYS if key not in parsed]
        if missing:
            return error_envelope(f"Missing required keys: {', '.join(missing)}", raw_response)

        invalid: list[str] = []
        for key in REQUIRED_OUTPUT_KEYS:
            value = parsed[key]
            if not isinstance(value, str) or not value.strip():
                invalid.append(key)
        if invalid:
            return error_envelope(
                f"Empty or non-string values for: {', '.join(invalid)}",
                raw_response,
            )

        return {key: parsed[key] for key in REQUIRED_OUTPUT_KEYS}
    except json.JSONDecodeError as exc:
        return error_envelope(f"Failed to parse AgentOutput: {exc}", raw_response)


def assemble_system_prompt(agent_config: dict[str, Any], skill_contents: dict[str, str]) -> str:
    """Build system prompt from agent config, inlined skills, and output schema example."""
    agent_id = agent_config.get("id", "agent")
    lines = [
        f"# Agent Role",
        f"You are the `{agent_id}` marketing worker agent.",
        "",
        "# Skills",
    ]
    for skill_name in agent_config.get("skills", []):
        body = skill_contents.get(skill_name, "").strip()
        lines.extend([f"## Skill: {skill_name}", body, ""])

    schema = agent_config.get("output_schema", {})
    example = {key: schema.get(key, f"<{key}>") for key in REQUIRED_OUTPUT_KEYS}
    lines.extend(
        [
            "# Required Output Format",
            "Respond with JSON only. Do not wrap the JSON in markdown code fences.",
            "Required keys and semantics:",
            json.dumps(example, indent=2, ensure_ascii=False),
        ]
    )
    return "\n".join(lines).strip()


def assemble_user_message(call_agent_input: dict[str, str]) -> str:
    return (
        f"# Task Title\n{call_agent_input.get('task_title', '')}\n\n"
        f"# Task Description\n{call_agent_input.get('task_description', '')}\n\n"
        f"# Critérios de Aceite\n{call_agent_input.get('criterios_de_aceite', '')}"
    )


def gemini_model_id(model: str) -> str:
    """Normalize agent model id for the n8n Gemini node."""
    if model.startswith("models/"):
        return model
    return f"models/{model}"


def provider_is_google(provider: str) -> bool:
    return provider.strip().lower() == "google"


def build_structured_log(
    *,
    task_id: str,
    agent_id: str,
    execution_id: str,
    latency_ms: int,
    parse_success: bool,
) -> dict[str, Any]:
    return {
        "task_id": task_id,
        "agent_id": agent_id,
        "execution_id": execution_id,
        "latency_ms": latency_ms,
        "parse_success": parse_success,
    }


def github_fetch_paths(agent_config: dict[str, Any]) -> list[str]:
    paths = [agent_config_path(str(agent_config["id"]))]
    for skill in agent_config.get("skills", []):
        paths.append(skill_path(str(skill)))
    return paths


def workflow_contains_github_path(workflow_text: str, path: str) -> bool:
    escaped = re.escape(path)
    return bool(re.search(escaped.replace(r"\{agent_id\}", r".+").replace(r"\{skill\}", r".+"), workflow_text)) or path in workflow_text
