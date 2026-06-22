#!/usr/bin/env python3
"""Task 07 Marketing Pipeline main n8n workflow validation tests."""

from __future__ import annotations

import json
import os
import subprocess
import unittest
from pathlib import Path
from typing import Any

from n8n.marketing_pipeline.logic import (
    COMMENT_SECTIONS,
    DEFAULT_AGENT_ID,
    DEFAULT_MODEL,
    HAPPY_PATH_NODE_SEQUENCE,
    agent_output_has_error,
    build_call_agent_input,
    comment_footer,
    comment_includes_required_sections,
    extract_custom_field_value,
    extract_task_fields,
    extract_webhook_context,
    field_id,
    format_clickup_comment,
    ingress_matches_ready_to_work,
    load_field_mapping,
    status_name,
    webhook_if_expression,
    workflow_connection_path,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = REPO_ROOT / "n8n" / "workflows" / "marketing-pipeline-main.json"
BUILD_SCRIPT = REPO_ROOT / "n8n" / "scripts" / "build_marketing_pipeline_workflow.py"
FIELD_MAPPING_PATH = REPO_ROOT / "clickup" / "field-mapping.json"
WEBHOOK_FIXTURE_PATH = (
    REPO_ROOT / "clickup" / "fixtures" / "task-status-updated-ready-to-work.json"
)
TASK_GET_FIXTURE_PATH = REPO_ROOT / "clickup" / "fixtures" / "task-get-response.json"
README_PATH = REPO_ROOT / "n8n" / "README.md"

SAMPLE_AGENT_OUTPUT = {
    "deliverable_markdown": "## Hook\n\nWe shipped a new dashboard.",
    "resumo": "Summary of the dashboard launch post.",
    "autochecagem": "- Dashboard mentioned\n- Sign-up CTA present",
}

CLICKUP_API_TOKEN = os.environ.get("CLICKUP_API_TOKEN", "").strip()
CLICKUP_LIST_ID = os.environ.get("CLICKUP_LIST_ID", "").strip()
HAS_CLICKUP_CREDS = bool(CLICKUP_API_TOKEN and CLICKUP_LIST_ID)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


class TestTask07IngressFilter(unittest.TestCase):
    def test_webhook_if_rejects_non_ready_to_work_status(self) -> None:
        payload = _load_json(WEBHOOK_FIXTURE_PATH)
        self.assertTrue(ingress_matches_ready_to_work(payload))

        not_ready = json.loads(json.dumps(payload))
        not_ready["history_items"][0]["after"]["status"] = "In Progress"
        self.assertFalse(ingress_matches_ready_to_work(not_ready))

        wrong_field = json.loads(json.dumps(payload))
        wrong_field["history_items"][0]["field"] = "priority"
        self.assertFalse(ingress_matches_ready_to_work(wrong_field))

    def test_workflow_if_node_matches_contract_expression(self) -> None:
        workflow = _load_json(WORKFLOW_PATH)
        nodes = {node["name"]: node for node in workflow["nodes"]}
        conditions = nodes["Ready to Work?"]["parameters"]["conditions"]["conditions"]
        exprs = [c["leftValue"] for c in conditions]
        self.assertIn('={{ $json.history_items[0].field }}', exprs)
        self.assertIn('={{ $json.history_items[0].after.status }}', exprs)
        self.assertEqual(webhook_if_expression().count("Ready to Work"), 1)


class TestTask07TaskFieldExtraction(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.field_mapping = load_field_mapping()
        cls.task = _load_json(TASK_GET_FIXTURE_PATH)

    def test_get_task_fixture_retrieves_required_fields(self) -> None:
        # Use fixture field ids aligned with test data.
        mapping = json.loads(json.dumps(self.field_mapping))
        mapping["custom_fields"]["criterios_de_aceite"]["clickup_field_id"] = "cf_criterios_001"
        mapping["custom_fields"]["agent_id"]["clickup_field_id"] = "cf_agent_id_001"

        fields = extract_task_fields(self.task, mapping)
        self.assertEqual(fields["task_title"], "Launch post for Q3 product update")
        self.assertIn("dashboard", fields["task_description"])
        self.assertIn("Mention the dashboard", fields["criterios_de_aceite"])
        self.assertEqual(fields["agent_id"], "linkedin-writer")

    def test_extract_custom_field_by_mapping_id(self) -> None:
        value = extract_custom_field_value(self.task, "cf_criterios_001")
        self.assertIn("Mention the dashboard", value)

    def test_build_call_agent_input_shape(self) -> None:
        mapping = json.loads(json.dumps(self.field_mapping))
        mapping["custom_fields"]["criterios_de_aceite"]["clickup_field_id"] = "cf_criterios_001"
        mapping["custom_fields"]["agent_id"]["clickup_field_id"] = "cf_agent_id_001"
        fields = extract_task_fields(self.task, mapping)
        envelope = build_call_agent_input(fields)
        for key in ("agent_id", "task_title", "task_description", "criterios_de_aceite"):
            self.assertIn(key, envelope)
            self.assertTrue(envelope[key])

    def test_workflow_extract_node_embeds_field_mapping_ids(self) -> None:
        workflow = _load_json(WORKFLOW_PATH)
        nodes = {node["name"]: node for node in workflow["nodes"]}
        code = nodes["Extract Task Fields"]["parameters"]["jsCode"]
        for key in ("criterios_de_aceite", "agent_id", "default_agent_id"):
            self.assertIn(key, code)


class TestTask07StatusAndCommentFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.field_mapping = load_field_mapping()
        cls.workflow = _load_json(WORKFLOW_PATH)
        cls.nodes = {node["name"]: node for node in cls.workflow["nodes"]}

    def test_status_patch_in_progress_before_execute_call_agent(self) -> None:
        path = workflow_connection_path(
            self.workflow,
            "Status → In Progress",
            "Execute Call Agent",
        )
        self.assertIsNotNone(path)
        assert path is not None
        self.assertIn("Prepare Call Agent Input", path)
        in_progress_idx = path.index("Status → In Progress")
        execute_idx = path.index("Execute Call Agent")
        self.assertLess(in_progress_idx, execute_idx)

    def test_in_progress_status_uses_field_mapping_string(self) -> None:
        expected = status_name(self.field_mapping, "in_progress")
        node = self.nodes["Status → In Progress"]
        self.assertEqual(node["parameters"]["updateFields"]["status"], expected)

    def test_comment_post_contains_required_sections(self) -> None:
        comment = format_clickup_comment(SAMPLE_AGENT_OUTPUT)
        self.assertTrue(comment_includes_required_sections(comment))
        for section in COMMENT_SECTIONS:
            self.assertIn(section, comment)

    def test_comment_footer_includes_agent_and_model(self) -> None:
        comment = format_clickup_comment(SAMPLE_AGENT_OUTPUT)
        footer = comment_footer(DEFAULT_AGENT_ID, DEFAULT_MODEL)
        self.assertIn(footer, comment)
        self.assertIn("Generated by linkedin-writer (gemini-2.5-flash)", comment)

    def test_review_status_only_after_comment_post(self) -> None:
        path = workflow_connection_path(
            self.workflow,
            "POST Task Comment",
            "Status → Review",
        )
        self.assertEqual(path, ["POST Task Comment", "Status → Review"])

        to_review = workflow_connection_path(
            self.workflow,
            "Execute Call Agent",
            "Status → Review",
        )
        self.assertIsNotNone(to_review)
        assert to_review is not None
        comment_idx = to_review.index("POST Task Comment")
        review_idx = to_review.index("Status → Review")
        self.assertLess(comment_idx, review_idx)

    def test_review_status_uses_field_mapping_string(self) -> None:
        expected = status_name(self.field_mapping, "review")
        node = self.nodes["Status → Review"]
        self.assertEqual(node["parameters"]["updateFields"]["status"], expected)


class TestTask07WorkflowExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = _load_json(WORKFLOW_PATH)
        cls.nodes_by_name = {node["name"]: node for node in cls.workflow["nodes"]}

    def test_workflow_is_not_placeholder_stub(self) -> None:
        self.assertNotIn("_comment", self.workflow)
        self.assertGreater(len(self.workflow["nodes"]), 0)

    def test_workflow_has_required_node_types(self) -> None:
        node_types = {node["type"] for node in self.workflow["nodes"]}
        expected = {
            "n8n-nodes-base.webhook",
            "n8n-nodes-base.if",
            "n8n-nodes-base.clickUp",
            "n8n-nodes-base.code",
            "n8n-nodes-base.executeWorkflow",
            "n8n-nodes-base.noOp",
        }
        missing = expected - node_types
        self.assertEqual(missing, set(), f"Missing node types: {missing}")

    def test_happy_path_node_sequence_reachable(self) -> None:
        for index in range(len(HAPPY_PATH_NODE_SEQUENCE) - 1):
            start = HAPPY_PATH_NODE_SEQUENCE[index]
            end = HAPPY_PATH_NODE_SEQUENCE[index + 1]
            path = workflow_connection_path(self.workflow, start, end)
            self.assertIsNotNone(path, f"No path from {start} to {end}")

    def test_execute_call_agent_references_subworkflow_placeholder(self) -> None:
        node = self.nodes_by_name["Execute Call Agent"]
        workflow_id = node["parameters"]["workflowId"]["value"]
        self.assertEqual(workflow_id, "CALL_AGENT_WORKFLOW_ID")

    def test_clickup_nodes_use_shared_credential_placeholder(self) -> None:
        clickup_nodes = [
            n for n in self.workflow["nodes"] if n["type"] == "n8n-nodes-base.clickUp"
        ]
        self.assertGreaterEqual(len(clickup_nodes), 3)
        for node in clickup_nodes:
            cred = node.get("credentials", {}).get("clickUpApi", {})
            self.assertEqual(cred.get("id"), "CLICKUP_CREDENTIAL_ID")

    def test_agent_parse_failure_does_not_connect_to_review(self) -> None:
        path = workflow_connection_path(
            self.workflow,
            "Agent Parse Failure",
            "Status → Review",
        )
        self.assertIsNone(path)

    def test_agent_failure_node_throws_visible_error(self) -> None:
        code = self.nodes_by_name["Agent Parse Failure"]["parameters"]["jsCode"]
        self.assertIn("throw new Error", code)
        self.assertIn("parse_success: false", code)

    def test_webhook_path_is_documented_in_export(self) -> None:
        webhook = self.nodes_by_name["ClickUp Webhook"]
        self.assertEqual(
            webhook["parameters"]["path"],
            "marketing-pipeline-ready-to-work",
        )

    def test_build_script_regenerates_workflow(self) -> None:
        before = WORKFLOW_PATH.read_text(encoding="utf-8")
        result = subprocess.run(
            ["python3", str(BUILD_SCRIPT)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        after = WORKFLOW_PATH.read_text(encoding="utf-8")
        self.assertTrue(len(after) > len(before) / 2)
        data = json.loads(after)
        self.assertEqual(data["name"], "Marketing Pipeline")


class TestTask07AgentErrorHandling(unittest.TestCase):
    def test_agent_output_has_error_detects_envelope(self) -> None:
        self.assertFalse(agent_output_has_error(SAMPLE_AGENT_OUTPUT))
        self.assertTrue(
            agent_output_has_error({"error": "Failed to parse", "raw_response": "{}"})
        )

    def test_workflow_routes_agent_errors_to_failure_branch(self) -> None:
        workflow = _load_json(WORKFLOW_PATH)
        connections = workflow["connections"]["Agent Output OK?"]["main"]
        false_branch = connections[1][0]["node"]
        self.assertEqual(false_branch, "Agent Parse Failure")


class TestTask07Readme(unittest.TestCase):
    def test_readme_documents_main_workflow_setup(self) -> None:
        readme = README_PATH.read_text(encoding="utf-8")
        for fragment in (
            "Marketing Pipeline",
            "marketing-pipeline-main.json",
            "marketing-pipeline-ready-to-work",
            "Ready to Work",
            "CALL_AGENT_WORKFLOW_ID",
            "CLICKUP_CREDENTIAL_ID",
            "Review",
            "In Progress",
        ):
            self.assertIn(fragment, readme, f"README missing: {fragment}")


@unittest.skipUnless(HAS_CLICKUP_CREDS, "CLICKUP_API_TOKEN and CLICKUP_LIST_ID required")
class TestTask07ClickUpIntegration(unittest.TestCase):
    """Integration tests against live ClickUp API (optional credentials)."""

    def test_field_mapping_ids_populated(self) -> None:
        mapping = load_field_mapping()
        list_id = mapping.get("clickup_list_id", "")
        if list_id == "<TBD>":
            self.skipTest("clickup_list_id not populated")
        for key in ("criterios_de_aceite", "agent_id"):
            fid = field_id(mapping, key)
            self.assertNotEqual(fid, "<TBD>", f"{key} field id still TBD")

    def test_status_names_match_clickup_list(self) -> None:
        mapping = load_field_mapping()
        for key in ("in_progress", "review", "ready_to_work"):
            self.assertTrue(status_name(mapping, key))


class TestTask07WebhookContext(unittest.TestCase):
    def test_extract_webhook_context_from_fixture(self) -> None:
        payload = _load_json(WEBHOOK_FIXTURE_PATH)
        context = extract_webhook_context(payload)
        self.assertEqual(context["task_id"], payload["task_id"])
        self.assertEqual(context["webhook_id"], payload["webhook_id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
