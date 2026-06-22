#!/usr/bin/env python3
"""Sync ClickUp list/field IDs into clickup/field-mapping.json via API."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
FIELD_MAPPING_PATH = REPO_ROOT / "clickup" / "field-mapping.json"
API_BASE = "https://api.clickup.com/api/v2"

EXPECTED_FIELDS = {
    "Critérios de Aceite": "criterios_de_aceite",
    "agent_id": "agent_id",
    "revision_count": "revision_count",
}


def _request(token: str, path: str) -> dict[str, Any]:
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        headers={"Authorization": token, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sync_field_mapping(token: str, list_id: str) -> dict[str, Any]:
    mapping = json.loads(FIELD_MAPPING_PATH.read_text(encoding="utf-8"))
    mapping["clickup_list_id"] = list_id

    list_data = _request(token, f"/list/{list_id}")
    if list_data.get("name") != mapping.get("list_name"):
        print(
            f"Warning: list name is {list_data.get('name')!r}, "
            f"expected {mapping.get('list_name')!r}",
            file=sys.stderr,
        )

    fields_resp = _request(token, f"/list/{list_id}/field")
    fields_by_name = {f["name"]: f["id"] for f in fields_resp.get("fields", [])}

    missing = [name for name in EXPECTED_FIELDS if name not in fields_by_name]
    if missing:
        raise SystemExit(
            f"Missing custom fields on list {list_id}: {missing}. "
            "Create them in ClickUp UI per clickup/list-schema.md"
        )

    for clickup_name, key in EXPECTED_FIELDS.items():
        mapping["custom_fields"][key]["clickup_field_id"] = fields_by_name[clickup_name]

    FIELD_MAPPING_PATH.write_text(
        json.dumps(mapping, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return mapping


def main() -> None:
    token = os.environ.get("CLICKUP_API_TOKEN") or os.environ.get("CLICKUP_TOKEN", "")
    token = token.strip()
    list_id = os.environ.get("CLICKUP_LIST_ID", "").strip()
    if not token or not list_id:
        raise SystemExit(
            "Set CLICKUP_API_TOKEN and CLICKUP_LIST_ID.\n"
            "Example: CLICKUP_API_TOKEN=pk_xxx CLICKUP_LIST_ID=123456 "
            "python3 clickup/sync-field-mapping.py"
        )

    mapping = sync_field_mapping(token, list_id)
    print(f"Updated {FIELD_MAPPING_PATH}")
    print(f"  list_id: {mapping['clickup_list_id']}")
    for key, field in mapping["custom_fields"].items():
        print(f"  {key}: {field['clickup_field_id']}")


if __name__ == "__main__":
    main()
