#!/usr/bin/env python3
"""Task 02 linkedin-writer agent runtime config validation tests."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

AGENT_JSON_PATH = REPO_ROOT / "agents" / "linkedin-writer.json"
SKILLS_DIR = REPO_ROOT / "agents" / "skills"

REQUIRED_AGENT_KEYS = {
    "id",
    "provider",
    "model",
    "skills",
    "temperature",
    "max_output_tokens",
    "output_schema",
}

OUTPUT_SCHEMA_KEYS = {"deliverable_markdown", "resumo", "autochecagem"}

GITHUB_FETCH_PATHS = {
    "agent_config": "agents/{agent_id}.json",
    "skill_markdown": "agents/skills/{skill_name}.md",
}

# Actionable rule markers expected in adapted skill bodies (not frontmatter-only).
WOLVEN_VOICE_MARKERS = ["Voice pillars", "Tone rules", "Do not"]
LINKEDIN_FORMAT_MARKERS = ["Post structure", "Formatting rules", "Hook"]


class TestTask02AgentConfig(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.agent = json.loads(AGENT_JSON_PATH.read_text(encoding="utf-8"))

    def test_linkedin_writer_json_parses_with_required_keys(self) -> None:
        missing = REQUIRED_AGENT_KEYS - set(self.agent.keys())
        self.assertEqual(missing, set(), f"Missing required keys: {missing}")

    def test_provider_and_model_match_adr_005(self) -> None:
        self.assertEqual(self.agent["provider"], "google")
        self.assertEqual(self.agent["model"], "gemini-2.5-flash")

    def test_skills_resolve_to_existing_files(self) -> None:
        skills = self.agent["skills"]
        self.assertIsInstance(skills, list)
        self.assertGreater(len(skills), 0, "skills[] must not be empty")
        missing = []
        for skill in skills:
            path = SKILLS_DIR / f"{skill}.md"
            if not path.is_file():
                missing.append(str(path.relative_to(REPO_ROOT)))
        self.assertEqual(missing, [], f"Missing skill files: {missing}")

    def test_output_schema_has_exact_agent_output_keys(self) -> None:
        schema = self.agent["output_schema"]
        self.assertIsInstance(schema, dict)
        self.assertEqual(set(schema.keys()), OUTPUT_SCHEMA_KEYS)
        for key in OUTPUT_SCHEMA_KEYS:
            self.assertIsInstance(schema[key], str)
            self.assertTrue(len(schema[key].strip()) > 0, f"{key} description must be non-empty")

    def test_wolven_voice_skill_has_actionable_rules(self) -> None:
        content = (SKILLS_DIR / "wolven-voice.md").read_text(encoding="utf-8").strip()
        self.assertTrue(len(content) > 0, "wolven-voice.md must not be empty")
        self.assertNotRegex(content, r"^---\s*\n", "wolven-voice.md should not start with YAML frontmatter")
        for marker in WOLVEN_VOICE_MARKERS:
            self.assertIn(marker, content, f"wolven-voice.md missing actionable section: {marker}")

    def test_linkedin_format_skill_has_actionable_rules(self) -> None:
        content = (SKILLS_DIR / "linkedin-format.md").read_text(encoding="utf-8").strip()
        self.assertTrue(len(content) > 0, "linkedin-format.md must not be empty")
        self.assertNotRegex(content, r"^---\s*\n", "linkedin-format.md should not start with YAML frontmatter")
        for marker in LINKEDIN_FORMAT_MARKERS:
            self.assertIn(marker, content, f"linkedin-format.md missing actionable section: {marker}")


class TestTask02AgentFetchContract(unittest.TestCase):
    """Integration: agent JSON + skills satisfy GitHub GET path contract."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.agent = json.loads(AGENT_JSON_PATH.read_text(encoding="utf-8"))

    def test_agent_config_fetch_path(self) -> None:
        agent_id = self.agent["id"]
        expected = GITHUB_FETCH_PATHS["agent_config"].format(agent_id=agent_id)
        actual = AGENT_JSON_PATH.relative_to(REPO_ROOT).as_posix()
        self.assertEqual(actual, expected)

    def test_skill_fetch_paths(self) -> None:
        for skill in self.agent["skills"]:
            expected = GITHUB_FETCH_PATHS["skill_markdown"].format(skill_name=skill)
            actual = (SKILLS_DIR / f"{skill}.md").relative_to(REPO_ROOT).as_posix()
            self.assertEqual(actual, expected)

    def test_agent_id_matches_filename(self) -> None:
        self.assertEqual(self.agent["id"], AGENT_JSON_PATH.stem)

    def test_readme_documents_load_paths_and_copy_procedure(self) -> None:
        readme = (REPO_ROOT / "agents" / "README.md").read_text(encoding="utf-8").lower()
        for phrase in (
            "agents/{agent_id}.json",
            "agents/skills/{skill_name}.md",
            "skill-vault",
            "output_schema",
        ):
            self.assertIn(phrase, readme, f"agents/README.md missing: {phrase}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
