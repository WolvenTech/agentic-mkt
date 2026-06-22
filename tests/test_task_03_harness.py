#!/usr/bin/env python3
"""Task 03 harness I/O contract and output schema validation tests."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

IO_CONTRACT_PATH = REPO_ROOT / "agent-harness" / "io-contract.md"
OUTPUT_SCHEMA_PATH = REPO_ROOT / "agent-harness" / "output-schema.json"
AGENT_JSON_PATH = REPO_ROOT / "agents" / "linkedin-writer.json"

CALL_AGENT_INPUT_FIELDS = {
    "agent_id",
    "task_title",
    "task_description",
    "criterios_de_aceite",
}

AGENT_OUTPUT_FIELDS = {"deliverable_markdown", "resumo", "autochecagem"}

SAMPLE_VALID_OUTPUT = {
    "deliverable_markdown": "## Hook\n\nSample LinkedIn post body.",
    "resumo": "Two-sentence summary of the draft angle.",
    "autochecagem": "- Criterion A met\n- Criterion B met",
}

SAMPLE_MISSING_AUTOCHECAGEM = {
    "deliverable_markdown": "Draft only.",
    "resumo": "Summary only.",
}


def validate_draft07_instance(instance: Any, schema: dict[str, Any]) -> list[str]:
    """Minimal draft-07 validator for AgentOutput object schemas (no external deps)."""
    errors: list[str] = []

    if schema.get("type") == "object":
        if not isinstance(instance, dict):
            return [f"Expected object, got {type(instance).__name__}"]

        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                errors.append(f"Missing required property: {key}")

        properties = schema.get("properties", {})
        for key, value in instance.items():
            if key not in properties:
                if schema.get("additionalProperties") is False:
                    errors.append(f"Additional property not allowed: {key}")
                continue
            prop_schema = properties[key]
            expected_type = prop_schema.get("type")
            if expected_type == "string" and not isinstance(value, str):
                errors.append(f"Property {key!r} must be string, got {type(value).__name__}")

    return errors


class TestTask03OutputSchema(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = json.loads(OUTPUT_SCHEMA_PATH.read_text(encoding="utf-8"))

    def test_output_schema_is_valid_json_with_draft07_meta(self) -> None:
        self.assertEqual(self.schema["$schema"], "http://json-schema.org/draft-07/schema#")
        self.assertEqual(self.schema["type"], "object")
        self.assertEqual(set(self.schema["required"]), AGENT_OUTPUT_FIELDS)
        self.assertFalse(self.schema.get("additionalProperties", True))

    def test_sample_valid_agent_output_passes_schema_validation(self) -> None:
        errors = validate_draft07_instance(SAMPLE_VALID_OUTPUT, self.schema)
        self.assertEqual(errors, [], f"Validation errors: {errors}")

    def test_sample_missing_autochecagem_fails_schema_validation(self) -> None:
        errors = validate_draft07_instance(SAMPLE_MISSING_AUTOCHECAGEM, self.schema)
        self.assertTrue(
            any("autochecagem" in err for err in errors),
            f"Expected missing autochecagem error, got: {errors}",
        )


class TestTask03IoContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = IO_CONTRACT_PATH.read_text(encoding="utf-8")

    def test_io_contract_lists_all_call_agent_input_fields(self) -> None:
        for field in CALL_AGENT_INPUT_FIELDS:
            self.assertIn(f"`{field}`", self.contract, f"io-contract.md missing field: {field}")

    def test_error_envelope_documented(self) -> None:
        self.assertIn('"error"', self.contract)
        self.assertIn('"raw_response"', self.contract)
        self.assertIn("raw_response", self.contract)
        lower = self.contract.lower()
        self.assertIn("parse failure", lower)
        self.assertIn("must not silently fail", lower)

    def test_clickup_comment_template_sections(self) -> None:
        for section in ("LinkedIn Draft", "Resumo", "Autochecagem"):
            self.assertIn(section, self.contract, f"Missing comment section: {section}")
        for placeholder in ("{deliverable_markdown}", "{resumo}", "{autochecagem}"):
            self.assertIn(placeholder, self.contract, f"Missing placeholder: {placeholder}")

    def test_adr001_no_idempotency_noted(self) -> None:
        lower = self.contract.lower()
        self.assertIn("idempotency", lower)
        self.assertIn("adr-001", lower)

    def test_cross_references_linkedin_writer_output_schema(self) -> None:
        self.assertIn("agents/linkedin-writer.json", self.contract)
        self.assertIn("output_schema", self.contract)


class TestTask03HarnessIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = json.loads(OUTPUT_SCHEMA_PATH.read_text(encoding="utf-8"))
        cls.agent = json.loads(AGENT_JSON_PATH.read_text(encoding="utf-8"))

    def test_output_schema_required_properties_match_agent_output_schema_keys(self) -> None:
        agent_keys = set(self.agent["output_schema"].keys())
        schema_required = set(self.schema["required"])
        self.assertEqual(schema_required, agent_keys)
        self.assertEqual(schema_required, AGENT_OUTPUT_FIELDS)

    def test_output_schema_descriptions_match_agent_output_schema(self) -> None:
        agent_descriptions = self.agent["output_schema"]
        schema_properties = self.schema["properties"]
        for key in AGENT_OUTPUT_FIELDS:
            self.assertEqual(
                schema_properties[key]["description"],
                agent_descriptions[key],
                f"Description mismatch for {key}",
            )

    def test_readme_links_contract_artifacts(self) -> None:
        readme = (REPO_ROOT / "agent-harness" / "README.md").read_text(encoding="utf-8")
        for fragment in (
            "io-contract.md",
            "output-schema.json",
            "CallAgentInput",
            "AgentOutput",
            "ADR-001",
        ):
            self.assertIn(fragment, readme, f"README missing: {fragment}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
