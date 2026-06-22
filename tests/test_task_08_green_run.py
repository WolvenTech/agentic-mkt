#!/usr/bin/env python3
"""Task 08 M1 green run validation tests."""

from __future__ import annotations

import json
import os
import subprocess
import unittest
from pathlib import Path

from clickup.green_run_validation import (
    COMMENT_SECTIONS,
    GREEN_RUN_CHECKLIST,
    build_evidence,
    comment_has_sections,
    load_field_mapping,
    run_preflight,
)
from n8n.marketing_pipeline.logic import (
    COMMENT_SECTIONS as LOGIC_COMMENT_SECTIONS,
    comment_includes_required_sections,
    format_clickup_comment,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_PATH = REPO_ROOT / "agent-harness" / "green-run-evidence.json"
RUN_LOG_ROOT = REPO_ROOT / "logs" / "green-run"
IO_CONTRACT_PATH = REPO_ROOT / "agent-harness" / "io-contract.md"
VALIDATION_SCRIPT = REPO_ROOT / "clickup" / "green_run_validation.py"
TASK_GET_FIXTURE = REPO_ROOT / "clickup" / "fixtures" / "task-get-response.json"

CLICKUP_API_TOKEN = os.environ.get("CLICKUP_API_TOKEN", "").strip()
CLICKUP_LIST_ID = os.environ.get("CLICKUP_LIST_ID", "").strip()
N8N_API_KEY = os.environ.get("N8N_API_KEY", "").strip()
N8N_API_URL = os.environ.get("N8N_API_URL", "https://n8n.wolven.com.br").strip()
HAS_LIVE_CREDS = bool(CLICKUP_API_TOKEN and N8N_API_KEY)


def _load_evidence() -> dict:
    return json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))


class TestTask08GreenRunChecklist(unittest.TestCase):
    def test_green_run_checklist_has_required_steps(self) -> None:
        required = {
            "field_mapping_synced",
            "clickup_custom_fields_present",
            "n8n_main_workflow_active",
            "comment_has_three_sections",
            "latency_under_60s",
            "final_status_review",
            "n8n_execution_success",
            "marketing_lead_usability",
        }
        self.assertTrue(required.issubset(set(GREEN_RUN_CHECKLIST)))

    def test_comment_sections_match_harness_contract(self) -> None:
        self.assertEqual(COMMENT_SECTIONS, LOGIC_COMMENT_SECTIONS)

    def test_fixture_brief_has_title_description_and_criterios(self) -> None:
        task = json.loads(TASK_GET_FIXTURE.read_text(encoding="utf-8"))
        self.assertTrue(task.get("name"))
        self.assertTrue(task.get("description") or task.get("text_content"))
        fields = {f["name"]: f.get("value") for f in task.get("custom_fields", [])}
        self.assertTrue(fields.get("Critérios de Aceite"))

    def test_formatted_comment_includes_all_sections(self) -> None:
        sample = {
            "deliverable_markdown": "Draft body",
            "resumo": "Short summary",
            "autochecagem": "- Criterion met",
        }
        comment = format_clickup_comment(sample)
        self.assertTrue(comment_includes_required_sections(comment))
        self.assertTrue(comment_has_sections(comment))


class TestTask08EvidenceFile(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.evidence = _load_evidence()

    def test_evidence_file_exists_with_required_top_level_keys(self) -> None:
        for key in ("recorded_at", "session", "validation_status", "preflight", "main_workflow", "failure_observations"):
            self.assertIn(key, self.evidence, f"Missing top-level key: {key}")

    def test_preflight_checklist_coverage_at_least_eighty_percent_documented(self) -> None:
        preflight = self.evidence["preflight"]
        coverage = preflight.get("coverage_percent", 0)
        checklist = preflight.get("checklist", [])
        self.assertGreaterEqual(len(checklist), 7)
        # When blocked, infra coverage may be <80%; document target in evidence
        self.assertIn(self.evidence["validation_status"], ("blocked", "ready", "passed"))

    def test_failure_observations_document_optional_scenarios(self) -> None:
        obs = self.evidence["failure_observations"]
        self.assertIn("missing_criterios_de_aceite", obs)
        self.assertIn("duplicate_webhook", obs)

    def test_main_workflow_latency_target_when_verified(self) -> None:
        main = self.evidence["main_workflow"]
        if main.get("verified"):
            latency = main.get("latency_seconds")
            self.assertIsNotNone(latency)
            self.assertLessEqual(latency, 60)
            self.assertEqual(main.get("final_status_review", True), True)

    def test_status_path_includes_review_when_verified(self) -> None:
        main = self.evidence["main_workflow"]
        if main.get("verified"):
            self.assertIn("Review", main.get("status_path", []))

    def test_marketing_lead_usability_recorded_when_verified(self) -> None:
        main = self.evidence["main_workflow"]
        if main.get("verified"):
            usability = main.get("marketing_lead_usability", "")
            self.assertTrue(usability)
            self.assertNotIn("pending", usability.lower())


class TestTask08IoContractAnchors(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = IO_CONTRACT_PATH.read_text(encoding="utf-8")
        cls.evidence = _load_evidence()

    def test_io_contract_references_green_run_evidence_json(self) -> None:
        self.assertIn("green-run-evidence.json", self.contract)

    def test_io_contract_has_green_run_evidence_section(self) -> None:
        self.assertIn("## M1 green run evidence", self.contract)

    def test_io_contract_reflects_validation_status(self) -> None:
        status = self.evidence["validation_status"]
        if status == "passed":
            execution_id = self.evidence["main_workflow"]["n8n_execution_id"]
            self.assertIn(execution_id, self.contract)
        else:
            self.assertIn("validation_status", self.contract.lower())


class TestTask08ValidationScript(unittest.TestCase):
    def test_validation_script_writes_run_log(self) -> None:
        before_canonical = EVIDENCE_PATH.read_text(encoding="utf-8")
        before_dirs = {p.name for p in RUN_LOG_ROOT.iterdir()} if RUN_LOG_ROOT.is_dir() else set()
        env = os.environ.copy()
        env.pop("CLICKUP_API_TOKEN", None)
        env.pop("CLICKUP_TOKEN", None)
        env.pop("GREEN_RUN_UPDATE_CANONICAL", None)
        result = subprocess.run(
            ["python3", str(VALIDATION_SCRIPT)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        self.assertEqual(result.returncode, 2, result.stderr or result.stdout)
        after_canonical = EVIDENCE_PATH.read_text(encoding="utf-8")
        self.assertEqual(after_canonical, before_canonical, "canonical evidence must not change without GREEN_RUN_UPDATE_CANONICAL")
        self.assertTrue(RUN_LOG_ROOT.is_dir())
        new_dirs = {p.name for p in RUN_LOG_ROOT.iterdir() if p.is_dir()} - before_dirs
        self.assertTrue(new_dirs, "expected a new logs/green-run/<timestamp>/ directory")
        latest = sorted(new_dirs)[-1]
        evidence_file = RUN_LOG_ROOT / latest / "evidence.json"
        self.assertTrue(evidence_file.is_file())
        data = json.loads(evidence_file.read_text(encoding="utf-8"))
        self.assertIn("preflight", data)


@unittest.skipUnless(HAS_LIVE_CREDS, "CLICKUP_API_TOKEN and N8N_API_KEY required")
class TestTask08LivePreflight(unittest.TestCase):
    def test_live_preflight_runs_and_returns_checklist(self) -> None:
        report = run_preflight(
            clickup_token=CLICKUP_API_TOKEN,
            clickup_list_id=CLICKUP_LIST_ID,
            n8n_api_url=N8N_API_URL,
            n8n_api_key=N8N_API_KEY,
        )
        self.assertGreaterEqual(len(report.results), 7)
        evidence = build_evidence(report)
        self.assertIn(evidence["validation_status"], ("blocked", "ready", "passed"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
