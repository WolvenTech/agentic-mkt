#!/usr/bin/env python3
"""Task 01 scaffold validation tests."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Paths task_01 creates (excludes task_02+ artifacts from full TechSpec tree).
TASK_01_PATHS = [
    "n8n/README.md",
    "n8n/mcp-config.stub.json",
    "n8n/workflows/marketing-pipeline-main.json",
    "n8n/workflows/call-agent-subworkflow.json",
    "clickup/README.md",
    "clickup/list-schema.md",
    "clickup/webhook-contract.md",
    "clickup/field-mapping.json",
    "agent-harness/README.md",
    "agent-harness/io-contract.md",
    "agent-harness/output-schema.json",
    "agents/README.md",
    "agents/skills",
]

TOP_LEVEL_DOMAIN_FOLDERS = ["n8n", "clickup", "agent-harness", "agents"]

README_REQUIRED_SECTIONS = ["purpose", "key files", "manual setup"]


class TestTask01Scaffold(unittest.TestCase):
    def test_task_01_paths_exist(self) -> None:
        missing = [p for p in TASK_01_PATHS if not (REPO_ROOT / p).exists()]
        self.assertEqual(missing, [], f"Missing paths: {missing}")

    def test_top_level_domain_folders_exist(self) -> None:
        missing = [d for d in TOP_LEVEL_DOMAIN_FOLDERS if not (REPO_ROOT / d).is_dir()]
        self.assertEqual(missing, [], f"Missing domain folders: {missing}")

    def test_domain_readmes_non_empty_with_required_sections(self) -> None:
        for folder in TOP_LEVEL_DOMAIN_FOLDERS:
            readme = REPO_ROOT / folder / "README.md"
            self.assertTrue(readme.is_file(), f"Missing README in {folder}/")
            content = readme.read_text(encoding="utf-8").strip()
            self.assertTrue(len(content) > 0, f"Empty README in {folder}/")
            lower = content.lower()
            for section in README_REQUIRED_SECTIONS:
                self.assertIn(
                    section,
                    lower,
                    f"{folder}/README.md missing section hint: {section}",
                )

    def test_workflow_placeholder_filenames(self) -> None:
        workflows = REPO_ROOT / "n8n" / "workflows"
        expected = {"marketing-pipeline-main.json", "call-agent-subworkflow.json"}
        actual = {p.name for p in workflows.iterdir() if p.is_file()}
        self.assertTrue(expected.issubset(actual), f"Missing workflow files: {expected - actual}")

    def test_agents_skills_directory_exists(self) -> None:
        skills = REPO_ROOT / "agents" / "skills"
        self.assertTrue(skills.is_dir(), "agents/skills/ must exist")

    def test_field_mapping_valid_json_structure(self) -> None:
        path = REPO_ROOT / "clickup" / "field-mapping.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        custom_fields = data.get("custom_fields", {})
        self.assertGreater(len(custom_fields), 0, "custom_fields must not be empty")
        self.assertIn("list_name", data)
        self.assertIn("statuses", data)
        for key, field in custom_fields.items():
            self.assertIn("name", field, f"{key} missing name")
            self.assertIn("clickup_field_id", field, f"{key} missing clickup_field_id")

    def test_workflow_json_are_stubs_not_live_logic(self) -> None:
        for name in ("marketing-pipeline-main.json", "call-agent-subworkflow.json"):
            data = json.loads((REPO_ROOT / "n8n" / "workflows" / name).read_text())
            self.assertIn("_comment", data, f"{name} should be a stub with _comment")
            self.assertEqual(data.get("nodes"), [], f"{name} nodes must be empty stub")


if __name__ == "__main__":
    unittest.main(verbosity=2)
