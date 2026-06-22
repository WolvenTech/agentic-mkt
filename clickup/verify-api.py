#!/usr/bin/env python3
"""Verify Marketing Pipeline list via ClickUp API (integration check for task_04)."""

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


def _request(token: str, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _field_map(task: dict[str, Any]) -> dict[str, Any]:
    return {cf.get("name"): cf for cf in task.get("custom_fields", [])}


def verify(token: str, list_id: str, *, cleanup: bool = True) -> str:
    mapping = json.loads(FIELD_MAPPING_PATH.read_text(encoding="utf-8"))
    field_ids = {
        spec["name"]: spec["clickup_field_id"]
        for spec in mapping["custom_fields"].values()
    }
    for name, fid in field_ids.items():
        if not fid or fid == "<TBD>":
            raise SystemExit(f"field-mapping.json has unset ID for {name!r}")

    task = _request(
        token,
        "POST",
        f"/list/{list_id}/task",
        {
            "name": "[task_04] API verification task",
            "description": "Automated test task — safe to delete.",
            "status": "Backlog",
        },
    )
    task_id = task["id"]

    try:
        _request(
            token,
            "POST",
            f"/task/{task_id}/field/{field_ids['Critérios de Aceite']}",
            {"value": "Draft must mention Wolven brand voice."},
        )
        _request(
            token,
            "POST",
            f"/task/{task_id}/field/{field_ids['agent_id']}",
            {"value": "linkedin-writer"},
        )
        _request(
            token,
            "POST",
            f"/task/{task_id}/field/{field_ids['revision_count']}",
            {"value": 0},
        )

        fetched = _request(token, "GET", f"/task/{task_id}")
        by_name = _field_map(fetched)
        for name in field_ids:
            if name not in by_name:
                raise SystemExit(f"GET task missing custom field: {name}")
            cf = by_name[name]
            if not cf.get("id"):
                raise SystemExit(f"Custom field {name} has no id in response")
        return task_id
    finally:
        if cleanup:
            try:
                _request(token, "DELETE", f"/task/{task_id}")
            except urllib.error.HTTPError:
                print(f"Warning: could not delete test task {task_id}", file=sys.stderr)


def main() -> None:
    token = (os.environ.get("CLICKUP_API_TOKEN") or os.environ.get("CLICKUP_TOKEN", "")).strip()
    list_id = os.environ.get("CLICKUP_LIST_ID", "").strip()
    if not token or not list_id:
        raise SystemExit("Set CLICKUP_API_TOKEN and CLICKUP_LIST_ID")

    task_id = verify(token, list_id)
    print(f"OK: custom fields readable on task {task_id} (deleted after verify)")


if __name__ == "__main__":
    main()
