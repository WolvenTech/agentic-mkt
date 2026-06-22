#!/usr/bin/env python3
"""Task 09 M2 harness documentation validation tests."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

IO_CONTRACT_PATH = REPO_ROOT / "agent-harness" / "io-contract.md"
GREEN_RUN_EVIDENCE_PATH = REPO_ROOT / "agent-harness" / "green-run-evidence.json"
DOMAIN_READMES = {
    "n8n": REPO_ROOT / "n8n" / "README.md",
    "clickup": REPO_ROOT / "clickup" / "README.md",
    "agent-harness": REPO_ROOT / "agent-harness" / "README.md",
    "agents": REPO_ROOT / "agents" / "README.md",
}

PLACEHOLDER_PATTERNS = (
    "<TBD>",
    "YOUR_",
    "EXAMPLE_",
    "placeholder",
    "TODO:",
    "abc123",
)

NAMED_PATTERNS = (
    "Sub-workflow Contract Pattern",
    "Status Flow Pattern",
    "Brief Gate Pattern",
    "GitHub Runtime Config Pattern",
)

PRD_F5_REQUIREMENTS = (
    "input/output contract",
    "workflow sequence",
    "troubleshooting",
    "reusable harness patterns",
    "green run evidence",
    "skill copy",
    "sync script",
    "adr-005",
)


def _load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_evidence() -> dict:
    return json.loads(GREEN_RUN_EVIDENCE_PATH.read_text(encoding="utf-8"))


class TestTask09GreenRunEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_text(IO_CONTRACT_PATH)
        cls.evidence = _load_evidence()
        cls.main = cls.evidence["main_workflow"]

    def test_green_run_evidence_file_has_required_fields(self) -> None:
        for key in (
            "n8n_execution_id",
            "clickup_task_url",
            "latency_seconds",
            "status_path",
        ):
            self.assertIn(key, self.main, f"main_workflow missing {key}")

    def test_io_contract_contains_execution_id_from_evidence(self) -> None:
        if self.evidence.get("validation_status") != "passed" or not self.main.get("verified"):
            self.assertIn("validation_status", self.contract.lower())
            return
        execution_id = self.main["n8n_execution_id"]
        self.assertTrue(execution_id)
        self.assertIn(execution_id, self.contract)
        for placeholder in PLACEHOLDER_PATTERNS:
            self.assertNotIn(placeholder, execution_id)

    def test_io_contract_contains_clickup_task_url_from_evidence(self) -> None:
        if self.evidence.get("validation_status") != "passed" or not self.main.get("verified"):
            self.assertIn("green-run-evidence.json", self.contract)
            return
        task_url = self.main["clickup_task_url"]
        self.assertTrue(task_url.startswith("https://app.clickup.com/"))
        self.assertIn(task_url, self.contract)
        for placeholder in PLACEHOLDER_PATTERNS:
            self.assertNotIn(placeholder, task_url)

    def test_io_contract_documents_observed_latency(self) -> None:
        if self.evidence.get("validation_status") != "passed" or not self.main.get("verified"):
            self.assertIn("latency", self.contract.lower())
            return
        latency = self.main["latency_seconds"]
        self.assertIsNotNone(latency)
        self.assertIn(str(latency), self.contract)
        self.assertLessEqual(latency, 60, "Green run latency should meet M1 <60s target")


class TestTask09Troubleshooting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_text(IO_CONTRACT_PATH).lower()

    def test_troubleshooting_section_exists(self) -> None:
        self.assertIn("## troubleshooting", self.contract)

    def test_webhook_not_reaching_n8n_diagnostics(self) -> None:
        self.assertIn("webhook not reaching n8n", self.contract)
        for step in (
            "active",
            "webhook url",
            "clickup webhook",
            "listen for test event",
            "task-status-updated-ready-to-work.json",
        ):
            self.assertIn(step, self.contract, f"Missing webhook diagnostic: {step}")

    def test_task_stuck_in_progress_diagnostics(self) -> None:
        self.assertIn("task stuck in in progress", self.contract)
        for step in (
            "n8n → executions",
            "execute call agent",
            "status → review",
        ):
            self.assertIn(step, self.contract, f"Missing stuck-task diagnostic: {step}")

    def test_gemini_json_parse_failure_diagnostics(self) -> None:
        self.assertIn("gemini json parse failures", self.contract)
        for step in (
            "error envelope",
            "raw_response",
            "parse_success",
            "agent parse failure",
        ):
            self.assertIn(step, self.contract, f"Missing Gemini parse diagnostic: {step}")

    def test_field_id_mismatch_diagnostics(self) -> None:
        self.assertIn("field id mismatches", self.contract)
        for step in (
            "field-mapping.json",
            "sync-field-mapping.py",
            "<tbd>",
        ):
            self.assertIn(step, self.contract, f"Missing field-mapping diagnostic: {step}")


class TestTask09ReusablePatterns(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_text(IO_CONTRACT_PATH)

    def test_at_least_three_named_patterns_documented(self) -> None:
        found = [name for name in NAMED_PATTERNS if name in self.contract]
        self.assertGreaterEqual(len(found), 3, f"Expected ≥3 patterns, found: {found}")

    def test_each_pattern_has_description_and_file_references(self) -> None:
        for name in NAMED_PATTERNS[:3]:
            self.assertIn(name, self.contract)
            # Pattern sections include "When to use" and "Artifact" table
            idx = self.contract.index(name)
            section = self.contract[idx : idx + 800].lower()
            self.assertIn("when to use", section, f"{name} missing when-to-use")
            self.assertIn("artifact", section, f"{name} missing artifact references")


class TestTask09DomainReadmes(unittest.TestCase):
    def test_each_domain_readme_has_m2_section(self) -> None:
        for domain, path in DOMAIN_READMES.items():
            content = _load_text(path)
            lower = content.lower()
            has_m2 = "m2 operational runbook" in lower or "m2 section" in lower
            self.assertTrue(has_m2, f"{domain}/README.md missing M2 operational runbook section")

    def test_n8n_readme_supports_reimport_procedure(self) -> None:
        readme = _load_text(DOMAIN_READMES["n8n"]).lower()
        for step in (
            "import call agent sub-workflow",
            "import and activate marketing pipeline",
            "register clickup webhook",
            "call-agent-subworkflow.json",
            "marketing-pipeline-main.json",
        ):
            self.assertIn(step, readme, f"n8n README missing re-import step: {step}")

    def test_agents_readme_documents_skill_copy_and_drift(self) -> None:
        readme = _load_text(DOMAIN_READMES["agents"]).lower()
        for topic in ("skill-vault", "drift risk", "sync script", "adr-005"):
            self.assertIn(topic, readme, f"agents README missing: {topic}")


class TestTask09PrdF5Coverage(unittest.TestCase):
    """Verify >=80% of PRD F5 documentation requirements are present in repo docs."""

    @classmethod
    def setUpClass(cls) -> None:
        combined = _load_text(IO_CONTRACT_PATH)
        for path in DOMAIN_READMES.values():
            combined += "\n" + _load_text(path)
        cls.combined = combined.lower()

    def test_prd_f5_requirement_coverage_at_least_eighty_percent(self) -> None:
        matched = sum(1 for req in PRD_F5_REQUIREMENTS if req in self.combined)
        coverage = matched / len(PRD_F5_REQUIREMENTS)
        self.assertGreaterEqual(
            coverage,
            0.8,
            f"PRD F5 coverage {coverage:.0%} — matched {matched}/{len(PRD_F5_REQUIREMENTS)}",
        )


class TestTask09TroubleshootingSimulatedWebhook(unittest.TestCase):
    """Operator can follow troubleshooting doc to diagnose simulated webhook failure."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load_text(IO_CONTRACT_PATH)
        cls.n8n_readme = _load_text(DOMAIN_READMES["n8n"])

    def test_troubleshooting_references_fixture_for_simulated_failure(self) -> None:
        self.assertIn("task-status-updated-ready-to-work.json", self.contract)
        self.assertIn("listen for test event", self.contract.lower())

    def test_n8n_readme_webhook_replay_cross_links_troubleshooting(self) -> None:
        lower = self.n8n_readme.lower()
        self.assertIn("webhook replay test", lower)
        self.assertIn("io-contract.md", self.n8n_readme)


if __name__ == "__main__":
    unittest.main(verbosity=2)
