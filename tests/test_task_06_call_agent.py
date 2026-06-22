#!/usr/bin/env python3
"""Task 06 Call Agent n8n sub-workflow validation tests."""

from __future__ import annotations

import base64
import json
import subprocess
import unittest
from pathlib import Path
from typing import Any

from n8n.call_agent.logic import (
    REQUIRED_OUTPUT_KEYS,
    agent_config_path,
    assemble_system_prompt,
    assemble_user_message,
    build_structured_log,
    decode_github_file_content,
    extract_gemini_text,
    gemini_model_id,
    github_fetch_paths,
    parse_agent_output,
    provider_is_google,
    skill_path,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = REPO_ROOT / "n8n" / "workflows" / "call-agent-subworkflow.json"
AGENT_JSON_PATH = REPO_ROOT / "agents" / "linkedin-writer.json"
SKILLS_DIR = REPO_ROOT / "agents" / "skills"
README_PATH = REPO_ROOT / "n8n" / "README.md"

HARDCODED_CALL_AGENT_INPUT = {
    "agent_id": "linkedin-writer",
    "task_title": "Launch post for Q3 product update",
    "task_description": "Announce the new dashboard feature for marketing leads.",
    "criterios_de_aceite": "- Mention the dashboard\n- CTA to sign up\n- Under 300 words",
}

SAMPLE_VALID_GEMINI_OUTPUT = {
    "deliverable_markdown": "## Hook\n\nWe shipped a new dashboard.",
    "resumo": "Summary of the dashboard launch post.",
    "autochecagem": "- Dashboard mentioned\n- Sign-up CTA present",
}


def _github_file_payload(text: str) -> dict[str, str]:
    encoded = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return {"content": encoded, "encoding": "base64"}


class TestTask06ParseLogic(unittest.TestCase):
    def test_valid_json_produces_all_required_output_keys(self) -> None:
        raw = json.dumps(SAMPLE_VALID_GEMINI_OUTPUT)
        result = parse_agent_output(raw)
        self.assertEqual(set(result.keys()), set(REQUIRED_OUTPUT_KEYS))

    def test_malformed_json_returns_error_envelope_not_partial_output(self) -> None:
        result = parse_agent_output("not-json-at-all")
        self.assertIn("error", result)
        self.assertIn("raw_response", result)
        self.assertNotIn("deliverable_markdown", result)

    def test_missing_autochecagem_returns_error_envelope(self) -> None:
        partial = {"deliverable_markdown": "draft", "resumo": "summary"}
        result = parse_agent_output(json.dumps(partial))
        self.assertIn("error", result)
        self.assertIn("autochecagem", result["error"])

    def test_json_fences_stripped_before_parse(self) -> None:
        fenced = f"```json\n{json.dumps(SAMPLE_VALID_GEMINI_OUTPUT)}\n```"
        result = parse_agent_output(fenced)
        self.assertEqual(set(result.keys()), set(REQUIRED_OUTPUT_KEYS))

    def test_empty_string_values_fail_validation(self) -> None:
        invalid = dict(SAMPLE_VALID_GEMINI_OUTPUT)
        invalid["resumo"] = "   "
        result = parse_agent_output(json.dumps(invalid))
        self.assertIn("error", result)
        self.assertIn("resumo", result["error"])

    def test_extract_gemini_text_from_simplified_node_output(self) -> None:
        response = {"content": {"parts": [{"text": json.dumps(SAMPLE_VALID_GEMINI_OUTPUT)}]}}
        text = extract_gemini_text(response)
        parsed = parse_agent_output(text)
        self.assertEqual(set(parsed.keys()), set(REQUIRED_OUTPUT_KEYS))

    def test_structured_log_fields(self) -> None:
        log = build_structured_log(
            task_id="task-1",
            agent_id="linkedin-writer",
            execution_id="exec-1",
            latency_ms=1200,
            parse_success=True,
        )
        for field in ("task_id", "agent_id", "execution_id", "latency_ms", "parse_success"):
            self.assertIn(field, log)


class TestTask06PromptAssembly(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.agent = json.loads(AGENT_JSON_PATH.read_text(encoding="utf-8"))
        cls.skills = {
            "wolven-voice": (SKILLS_DIR / "wolven-voice.md").read_text(encoding="utf-8"),
            "linkedin-format": (SKILLS_DIR / "linkedin-format.md").read_text(encoding="utf-8"),
        }

    def test_system_prompt_includes_both_skill_files(self) -> None:
        prompt = assemble_system_prompt(self.agent, self.skills)
        self.assertIn("wolven-voice", prompt)
        self.assertIn("linkedin-format", prompt)
        self.assertIn("Voice pillars", prompt)
        self.assertIn("Post structure", prompt)
        self.assertIn("deliverable_markdown", prompt)

    def test_user_message_includes_brief_fields(self) -> None:
        message = assemble_user_message(HARDCODED_CALL_AGENT_INPUT)
        for field in ("task_title", "task_description", "criterios_de_aceite"):
            self.assertIn(HARDCODED_CALL_AGENT_INPUT[field].split("\n")[0], message)

    def test_github_fetch_paths_for_linkedin_writer(self) -> None:
        paths = github_fetch_paths(self.agent)
        self.assertIn("agents/linkedin-writer.json", paths)
        self.assertIn("agents/skills/wolven-voice.md", paths)
        self.assertIn("agents/skills/linkedin-format.md", paths)

    def test_decode_github_file_content_roundtrip(self) -> None:
        payload = _github_file_payload(json.dumps(self.agent))
        decoded = decode_github_file_content(payload)
        self.assertEqual(json.loads(decoded)["id"], "linkedin-writer")

    def test_gemini_model_id_normalization(self) -> None:
        self.assertEqual(gemini_model_id("gemini-2.5-flash"), "models/gemini-2.5-flash")
        self.assertEqual(gemini_model_id("models/gemini-2.5-flash"), "models/gemini-2.5-flash")

    def test_provider_routing_google_only(self) -> None:
        self.assertTrue(provider_is_google("google"))
        self.assertFalse(provider_is_google("anthropic"))


class TestTask06WorkflowExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
        cls.nodes_by_name = {node["name"]: node for node in cls.workflow["nodes"]}
        cls.workflow_text = WORKFLOW_PATH.read_text(encoding="utf-8")

    def test_workflow_is_not_placeholder_stub(self) -> None:
        self.assertNotIn("_comment", self.workflow)
        self.assertGreater(len(self.workflow["nodes"]), 0)

    def test_workflow_has_required_node_types(self) -> None:
        node_types = {node["type"] for node in self.workflow["nodes"]}
        expected = {
            "n8n-nodes-base.executeWorkflowTrigger",
            "n8n-nodes-base.manualTrigger",
            "n8n-nodes-base.github",
            "@n8n/n8n-nodes-langchain.googleGemini",
            "n8n-nodes-base.code",
            "n8n-nodes-base.if",
        }
        missing = expected - node_types
        self.assertEqual(missing, set(), f"Missing node types: {missing}")

    def test_github_nodes_fetch_agent_and_skill_paths(self) -> None:
        github_nodes = [n for n in self.workflow["nodes"] if n["type"] == "n8n-nodes-base.github"]
        self.assertEqual(len(github_nodes), 2)
        file_paths = [n["parameters"].get("filePath", "") for n in github_nodes]
        joined = " ".join(file_paths)
        self.assertIn("agent_id", joined)
        self.assertIn("skill_path", joined)
        self.assertEqual(agent_config_path("linkedin-writer"), "agents/linkedin-writer.json")
        self.assertEqual(skill_path("wolven-voice"), "agents/skills/wolven-voice.md")

    def test_gemini_node_uses_json_output_and_model_from_agent(self) -> None:
        gemini = self.nodes_by_name["Google Gemini"]
        self.assertEqual(gemini["parameters"]["resource"], "text")
        self.assertEqual(gemini["parameters"]["operation"], "message")
        self.assertTrue(gemini["parameters"]["jsonOutput"])
        model_expr = gemini["parameters"]["modelId"]["value"]
        self.assertIn("gemini", model_expr)

    def test_parse_node_validates_required_output_keys(self) -> None:
        parse_node = self.nodes_by_name["Parse Agent Output"]
        code = parse_node["parameters"]["jsCode"]
        for key in REQUIRED_OUTPUT_KEYS:
            self.assertIn(key, code)

    def test_hardcoded_test_input_present_for_isolation(self) -> None:
        hardcoded = self.nodes_by_name["Hardcoded Test Input"]
        payload = json.loads(hardcoded["parameters"]["jsonOutput"])
        self.assertEqual(payload["agent_id"], "linkedin-writer")
        pin = self.workflow.get("pinData", {}).get("When Executed by Another Workflow", [])
        self.assertTrue(pin)
        self.assertEqual(pin[0]["json"]["agent_id"], "linkedin-writer")

    def test_github_nodes_retry_once(self) -> None:
        for node in self.workflow["nodes"]:
            if node["type"] != "n8n-nodes-base.github":
                continue
            self.assertTrue(node.get("retryOnFail"), f"{node['name']} missing retryOnFail")
            self.assertEqual(node.get("maxTries"), 2, f"{node['name']} maxTries != 2")

    def test_workflow_reimports_without_structural_errors(self) -> None:
        required_top_level = {"name", "nodes", "connections"}
        missing = required_top_level - set(self.workflow.keys())
        self.assertEqual(missing, set())
        for node in self.workflow["nodes"]:
            self.assertIn("name", node)
            self.assertIn("type", node)
            self.assertIn("parameters", node)
            self.assertIn("position", node)
        for source, outputs in self.workflow["connections"].items():
            self.assertIn(source, self.nodes_by_name, f"Unknown connection source: {source}")
            for branch in outputs.get("main", []):
                for link in branch:
                    self.assertIn(link["node"], self.nodes_by_name)

    def test_error_envelope_on_unsupported_provider(self) -> None:
        error_node = self.nodes_by_name["Unsupported Provider Error"]
        code = error_node["parameters"]["jsCode"]
        self.assertIn("error", code)
        self.assertIn("raw_response", code)


class TestTask06ReadmeAndIntegration(unittest.TestCase):
    def test_readme_documents_subworkflow_test_procedure(self) -> None:
        readme = README_PATH.read_text(encoding="utf-8")
        for fragment in (
            "Call Agent",
            "isolation",
            "linkedin-writer",
            "Manual Trigger",
            "parse_success",
            "error envelope",
        ):
            self.assertIn(fragment, readme, f"README missing: {fragment}")

    def test_end_to_end_prompt_assembly_with_local_agent_files(self) -> None:
        agent = json.loads(AGENT_JSON_PATH.read_text(encoding="utf-8"))
        skills = {
            name: (SKILLS_DIR / f"{name}.md").read_text(encoding="utf-8")
            for name in agent["skills"]
        }
        system_prompt = assemble_system_prompt(agent, skills)
        user_message = assemble_user_message(HARDCODED_CALL_AGENT_INPUT)
        self.assertTrue(len(system_prompt) > 200)
        self.assertTrue(len(user_message) > 50)
        simulated = parse_agent_output(json.dumps(SAMPLE_VALID_GEMINI_OUTPUT))
        for key in REQUIRED_OUTPUT_KEYS:
            self.assertTrue(simulated[key].strip())

    def test_github_agent_json_fetchable_from_remote(self) -> None:
        remote = subprocess.run(
            ["gh", "api", "repos/rafiti052/agentic-mkt/contents/agents/linkedin-writer.json", "--jq", ".content"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if remote.returncode != 0:
            self.skipTest(f"gh not authenticated or repo unreachable: {remote.stderr.strip()}")
        encoded = remote.stdout.strip().strip('"')
        body = base64.b64decode(encoded).decode("utf-8")
        data = json.loads(body)
        self.assertEqual(data["id"], "linkedin-writer")


if __name__ == "__main__":
    unittest.main(verbosity=2)
