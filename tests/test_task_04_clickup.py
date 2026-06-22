#!/usr/bin/env python3
"""Task 04 ClickUp schema, field mapping, and webhook contract validation tests."""

from __future__ import annotations

import importlib.util
import json
import os
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

FIELD_MAPPING_PATH = REPO_ROOT / "clickup" / "field-mapping.json"
LIST_SCHEMA_PATH = REPO_ROOT / "clickup" / "list-schema.md"
WEBHOOK_CONTRACT_PATH = REPO_ROOT / "clickup" / "webhook-contract.md"
WEBHOOK_FIXTURE_PATH = (
    REPO_ROOT / "clickup" / "fixtures" / "task-status-updated-ready-to-work.json"
)

REQUIRED_STATUS_KEYS = {
    "ready_to_work": "Ready to Work",
    "in_progress": "In Progress",
    "review": "Review",
}

PRIMARY_STATUSES = [
    "Backlog",
    "Ready to Work",
    "In Progress",
    "Review",
    "Approved",
    "Done",
]

RESERVED_STATUSES = ["Blocked", "Needs Revision"]

PRD_CUSTOM_FIELD_NAMES = ["Critérios de Aceite", "agent_id", "revision_count"]

TECHSPEC_FILTER = 'history_items[].after.status.status == "Ready to Work"'

CLICKUP_API_TOKEN = os.environ.get("CLICKUP_API_TOKEN", "").strip()
CLICKUP_LIST_ID = os.environ.get("CLICKUP_LIST_ID", "").strip()
HAS_CLICKUP_CREDS = bool(CLICKUP_API_TOKEN and CLICKUP_LIST_ID)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _ingress_matches_ready_to_work(payload: dict[str, Any]) -> bool:
    """n8n ingress logic per webhook-contract.md (ClickUp payload shape)."""
    items = payload.get("history_items") or []
    if not items:
        return False
    item = items[0]
    return item.get("field") == "status" and item.get("after", {}).get("status") == "Ready to Work"


@unittest.skipUnless(HAS_CLICKUP_CREDS, "CLICKUP_API_TOKEN and CLICKUP_LIST_ID required")
class TestTask04ClickUpIntegration(unittest.TestCase):
    def test_get_task_returns_all_custom_fields(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "verify_api", REPO_ROOT / "clickup" / "verify-api.py"
        )
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        task_id = module.verify(CLICKUP_API_TOKEN, CLICKUP_LIST_ID, cleanup=True)
        self.assertTrue(task_id)


class TestTask04ClickUpUnit(unittest.TestCase):
    def test_field_mapping_valid_json_no_tbd_in_field_ids(self) -> None:
        data = _load_json(FIELD_MAPPING_PATH)
        for key, field in data.get("custom_fields", {}).items():
            field_id = field.get("clickup_field_id", "")
            self.assertNotEqual(
                field_id,
                "<TBD>",
                f"custom_fields.{key}.clickup_field_id is still <TBD>",
            )
            self.assertTrue(
                len(str(field_id)) > 0,
                f"custom_fields.{key}.clickup_field_id must be set",
            )

    def test_field_mapping_status_keys_and_display_strings(self) -> None:
        data = _load_json(FIELD_MAPPING_PATH)
        statuses = data.get("statuses", {})
        for key, display in REQUIRED_STATUS_KEYS.items():
            self.assertIn(key, statuses, f"Missing status key: {key}")
            self.assertEqual(statuses[key], display)

    def test_list_schema_documents_primary_and_reserved_statuses(self) -> None:
        content = LIST_SCHEMA_PATH.read_text(encoding="utf-8")
        for status in PRIMARY_STATUSES:
            self.assertIn(status, content, f"list-schema.md missing status: {status}")
        for status in RESERVED_STATUSES:
            self.assertIn(status, content, f"list-schema.md missing reserved status: {status}")
        self.assertIn("Brief gate", content)
        self.assertIn("Critérios de Aceite", content)

    def test_webhook_contract_documents_ingress_filter(self) -> None:
        content = WEBHOOK_CONTRACT_PATH.read_text(encoding="utf-8")
        self.assertIn(TECHSPEC_FILTER, content)
        self.assertIn("Task Status Updated", content)
        self.assertIn("Ready to Work", content)

    def test_custom_field_names_match_prd(self) -> None:
        data = _load_json(FIELD_MAPPING_PATH)
        names = [f["name"] for f in data["custom_fields"].values()]
        for expected in PRD_CUSTOM_FIELD_NAMES:
            self.assertIn(expected, names)

    def test_webhook_fixture_shape_matches_clickup_format(self) -> None:
        payload = _load_json(WEBHOOK_FIXTURE_PATH)
        self.assertEqual(payload.get("event"), "taskStatusUpdated")
        self.assertIn("task_id", payload)
        self.assertIn("history_items", payload)
        item = payload["history_items"][0]
        self.assertEqual(item.get("field"), "status")
        self.assertIsInstance(item.get("after"), dict)
        self.assertIn("status", item["after"])
        self.assertIsInstance(item["after"]["status"], str)

    def test_ingress_filter_accepts_fixture_rejects_other_status(self) -> None:
        payload = _load_json(WEBHOOK_FIXTURE_PATH)
        self.assertEqual(payload["event"], "taskStatusUpdated")
        self.assertTrue(_ingress_matches_ready_to_work(payload))
        after_status = payload["history_items"][0]["after"]["status"]
        self.assertEqual(after_status, "Ready to Work")

        not_ready = json.loads(json.dumps(payload))
        not_ready["history_items"][0]["after"]["status"] = "In Progress"
        self.assertFalse(_ingress_matches_ready_to_work(not_ready))

    def test_field_mapping_has_list_id_when_populated(self) -> None:
        data = _load_json(FIELD_MAPPING_PATH)
        list_id = data.get("clickup_list_id", "")
        if list_id == "<TBD>":
            self.skipTest("clickup_list_id not yet populated — run sync-field-mapping.py")
        self.assertTrue(len(str(list_id)) > 0)


class TestTask04WebhookContractReview(unittest.TestCase):
    """Webhook contract review against ClickUp payload format (required deliverable)."""

    def test_contract_documents_after_status_string_not_nested(self) -> None:
        content = WEBHOOK_CONTRACT_PATH.read_text(encoding="utf-8")
        self.assertIn("after.status", content)
        self.assertIn("Payload review", content)

    def test_fixture_after_status_is_string_per_clickup_docs(self) -> None:
        payload = _load_json(WEBHOOK_FIXTURE_PATH)
        after = payload["history_items"][0]["after"]
        self.assertIsInstance(after["status"], str)
        self.assertNotIsInstance(after["status"], dict)


if __name__ == "__main__":
    unittest.main(verbosity=2)
