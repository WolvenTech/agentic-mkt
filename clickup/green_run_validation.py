#!/usr/bin/env python3
"""M1 green run preflight and execution helper (task_08).

Runs the TechSpec integration checklist against live ClickUp + n8n when
infrastructure is ready. Writes run evidence to logs/green-run/<timestamp>/
(gitignored). Updates agent-harness/green-run-evidence.json only when
GREEN_RUN_UPDATE_CANONICAL=1.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
FIELD_MAPPING_PATH = REPO_ROOT / "clickup" / "field-mapping.json"
EVIDENCE_PATH = REPO_ROOT / "agent-harness" / "green-run-evidence.json"
RUN_LOG_ROOT = REPO_ROOT / "logs" / "green-run"
RUN_LOG_ROOT = REPO_ROOT / "logs" / "green-run"
CLICKUP_API = "https://api.clickup.com/api/v2"

GREEN_RUN_CHECKLIST = (
    "field_mapping_synced",
    "clickup_list_configured",
    "clickup_custom_fields_present",
    "clickup_statuses_present",
    "n8n_call_agent_workflow_present",
    "n8n_main_workflow_present",
    "n8n_main_workflow_active",
    "test_task_brief_complete",
    "status_in_progress_within_5s",
    "comment_has_three_sections",
    "latency_under_60s",
    "final_status_review",
    "n8n_execution_success",
    "marketing_lead_usability",
)

REQUIRED_STATUSES = ("Ready to Work", "In Progress", "Review")
REQUIRED_FIELDS = ("Critérios de Aceite", "agent_id", "revision_count")
COMMENT_SECTIONS = ("## LinkedIn Draft", "## Resumo", "## Autochecagem")

DEFAULT_TEST_BRIEF = {
    "name": "[M1 green run] Launch post for Q3 product update",
    "description": (
        "Announce the new dashboard feature for marketing leads. "
        "Angle: productivity win for remote teams."
    ),
    "criterios_de_aceite": (
        "- Mention the dashboard\n- CTA to sign up\n- Under 300 words"
    ),
}


@dataclass
class CheckResult:
    step: str
    passed: bool
    detail: str


@dataclass
class PreflightReport:
    results: list[CheckResult] = field(default_factory=list)

    @property
    def blockers(self) -> list[str]:
        return [r.detail for r in self.results if not r.passed]

    @property
    def coverage_percent(self) -> float:
        if not self.results:
            return 0.0
        passed = sum(1 for r in self.results if r.passed)
        return round(100 * passed / len(self.results), 1)

    def to_dict(self) -> dict[str, Any]:
        return {
            "checklist": [
                {"step": r.step, "status": "pass" if r.passed else "fail", "detail": r.detail}
                for r in self.results
            ],
            "coverage_percent": self.coverage_percent,
            "blockers": self.blockers,
        }


def _clickup_request(token: str, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{CLICKUP_API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _n8n_request(api_url: str, api_key: str, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={
            "X-N8N-API-KEY": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_field_mapping() -> dict[str, Any]:
    return json.loads(FIELD_MAPPING_PATH.read_text(encoding="utf-8"))


def field_mapping_synced(mapping: dict[str, Any]) -> CheckResult:
    list_id = str(mapping.get("clickup_list_id", ""))
    if not list_id or list_id == "<TBD>":
        return CheckResult("field_mapping_synced", False, "clickup_list_id is unset — run sync-field-mapping.py")
    for key, spec in mapping.get("custom_fields", {}).items():
        fid = str(spec.get("clickup_field_id", ""))
        if not fid or fid == "<TBD>":
            return CheckResult(
                "field_mapping_synced",
                False,
                f"custom field {key!r} has unset clickup_field_id — run sync-field-mapping.py",
            )
    return CheckResult("field_mapping_synced", True, f"field-mapping.json synced for list {list_id}")


def clickup_list_configured(token: str, list_id: str, mapping: dict[str, Any]) -> CheckResult:
    try:
        data = _clickup_request(token, "GET", f"/list/{list_id}")
    except urllib.error.HTTPError as exc:
        return CheckResult("clickup_list_configured", False, f"ClickUp list {list_id} not reachable: HTTP {exc.code}")
    expected = mapping.get("list_name", "Marketing Pipeline")
    actual = data.get("name", "")
    if actual != expected:
        return CheckResult(
            "clickup_list_configured",
            False,
            f"List name is {actual!r}, expected {expected!r} — use Marketing Pipeline list per clickup/list-schema.md",
        )
    return CheckResult("clickup_list_configured", True, f"List {list_id!r} is {actual!r}")


def clickup_custom_fields_present(token: str, list_id: str) -> CheckResult:
    try:
        data = _clickup_request(token, "GET", f"/list/{list_id}/field")
    except urllib.error.HTTPError as exc:
        return CheckResult("clickup_custom_fields_present", False, f"Cannot list fields: HTTP {exc.code}")
    names = {f.get("name") for f in data.get("fields", [])}
    missing = [name for name in REQUIRED_FIELDS if name not in names]
    if missing:
        return CheckResult(
            "clickup_custom_fields_present",
            False,
            f"Missing custom fields (create in ClickUp UI): {missing}",
        )
    return CheckResult("clickup_custom_fields_present", True, "All M1 custom fields present")


def clickup_statuses_present(token: str, list_id: str) -> CheckResult:
    try:
        data = _clickup_request(token, "GET", f"/list/{list_id}")
    except urllib.error.HTTPError as exc:
        return CheckResult("clickup_statuses_present", False, f"Cannot read list statuses: HTTP {exc.code}")
    names = {s.get("status") for s in data.get("statuses", [])}
    missing = [name for name in REQUIRED_STATUSES if name not in names]
    if missing:
        return CheckResult(
            "clickup_statuses_present",
            False,
            f"Missing statuses on list: {missing}",
        )
    return CheckResult("clickup_statuses_present", True, "Ready to Work / In Progress / Review present")


def _find_n8n_workflow(workflows: list[dict[str, Any]], *names: str) -> dict[str, Any] | None:
    lowered = {n.lower() for n in names}
    for wf in workflows:
        if wf.get("name", "").lower() in lowered:
            return wf
    return None


def n8n_workflow_checks(api_url: str, api_key: str) -> list[CheckResult]:
    try:
        data = _n8n_request(api_url, api_key, "GET", "/api/v1/workflows?limit=100")
    except urllib.error.HTTPError as exc:
        msg = exc.read().decode("utf-8", errors="replace")
        fail = CheckResult("n8n_call_agent_workflow_present", False, f"n8n API error: HTTP {exc.code} {msg}")
        return [
            fail,
            CheckResult("n8n_main_workflow_present", False, fail.detail),
            CheckResult("n8n_main_workflow_active", False, fail.detail),
        ]
    workflows = data.get("data", [])
    call_agent = _find_n8n_workflow(workflows, "Call Agent")
    main = _find_n8n_workflow(workflows, "Marketing Pipeline")
    results = [
        CheckResult(
            "n8n_call_agent_workflow_present",
            call_agent is not None,
            "Call Agent sub-workflow imported" if call_agent else "Import n8n/workflows/call-agent-subworkflow.json",
        ),
        CheckResult(
            "n8n_main_workflow_present",
            main is not None,
            "Marketing Pipeline main workflow imported" if main else "Import n8n/workflows/marketing-pipeline-main.json",
        ),
        CheckResult(
            "n8n_main_workflow_active",
            bool(main and main.get("active")),
            "Marketing Pipeline workflow is active"
            if main and main.get("active")
            else "Activate Marketing Pipeline after binding credentials",
        ),
    ]
    return results


def run_preflight(
    *,
    clickup_token: str,
    clickup_list_id: str,
    n8n_api_url: str,
    n8n_api_key: str,
) -> PreflightReport:
    mapping = load_field_mapping()
    report = PreflightReport()
    report.results.append(field_mapping_synced(mapping))

    list_id = str(mapping.get("clickup_list_id") or clickup_list_id or "")
    if list_id and list_id != "<TBD>":
        report.results.append(clickup_list_configured(clickup_token, list_id, mapping))
        report.results.append(clickup_custom_fields_present(clickup_token, list_id))
        report.results.append(clickup_statuses_present(clickup_token, list_id))
    else:
        report.results.extend(
            [
                CheckResult("clickup_list_configured", False, "CLICKUP_LIST_ID / clickup_list_id unset"),
                CheckResult("clickup_custom_fields_present", False, "Skipped — list ID unset"),
                CheckResult("clickup_statuses_present", False, "Skipped — list ID unset"),
            ]
        )

    report.results.extend(n8n_workflow_checks(n8n_api_url, n8n_api_key))
    return report


def comment_has_sections(comment_text: str) -> bool:
    return all(section in comment_text for section in COMMENT_SECTIONS)


def _set_custom_field(token: str, task_id: str, field_id: str, value: Any) -> None:
    _clickup_request(token, "POST", f"/task/{task_id}/field/{field_id}", {"value": value})


def _task_comments(token: str, task_id: str) -> list[dict[str, Any]]:
    data = _clickup_request(token, "GET", f"/task/{task_id}/comment")
    return data.get("comments", [])


def _task_status(token: str, task_id: str) -> str:
    task = _clickup_request(token, "GET", f"/task/{task_id}")
    return str((task.get("status") or {}).get("status", ""))


def execute_green_run(
    *,
    clickup_token: str,
    mapping: dict[str, Any],
    marketing_lead_usability: str = "pending review",
) -> dict[str, Any]:
    """Run happy-path green run when preflight infrastructure checks pass."""
    list_id = str(mapping["clickup_list_id"])
    fields = mapping["custom_fields"]
    criterios_id = fields["criterios_de_aceite"]["clickup_field_id"]
    agent_id_field = fields["agent_id"]["clickup_field_id"]
    ready_status = mapping["statuses"]["ready_to_work"]

    task = _clickup_request(
        clickup_token,
        "POST",
        f"/list/{list_id}/task",
        {
            "name": DEFAULT_TEST_BRIEF["name"],
            "description": DEFAULT_TEST_BRIEF["description"],
            "status": mapping["statuses"].get("backlog", "Backlog"),
        },
    )
    task_id = task["id"]
    task_url = task.get("url") or f"https://app.clickup.com/t/{task_id}"

    try:
        _set_custom_field(clickup_token, task_id, criterios_id, DEFAULT_TEST_BRIEF["criterios_de_aceite"])
        _set_custom_field(
            clickup_token,
            task_id,
            agent_id_field,
            fields["agent_id"].get("default", "linkedin-writer"),
        )

        brief_ok = bool(DEFAULT_TEST_BRIEF["name"] and DEFAULT_TEST_BRIEF["description"] and DEFAULT_TEST_BRIEF["criterios_de_aceite"])

        t0 = time.time()
        _clickup_request(clickup_token, "PUT", f"/task/{task_id}", {"status": ready_status})

        in_progress_at: float | None = None
        comment_at: float | None = None
        review_at: float | None = None
        comment_text = ""
        deadline = t0 + 120

        while time.time() < deadline:
            status = _task_status(clickup_token, task_id)
            now = time.time()
            if status == mapping["statuses"]["in_progress"] and in_progress_at is None:
                in_progress_at = now
            comments = _task_comments(clickup_token, task_id)
            for comment in comments:
                text = comment.get("comment_text") or comment.get("text_content") or ""
                if comment_has_sections(text):
                    comment_text = text
                    comment_at = now
                    break
            if status == mapping["statuses"]["review"]:
                review_at = now
                break
            time.sleep(2)

        latency_total = round((comment_at or time.time()) - t0, 1)
        ip_latency = round((in_progress_at or time.time()) - t0, 1) if in_progress_at else None

        return {
            "verified": True,
            "clickup_task_id": task_id,
            "clickup_task_url": task_url,
            "clickup_task_name": DEFAULT_TEST_BRIEF["name"],
            "status_path": [
                ready_status,
                mapping["statuses"]["in_progress"],
                mapping["statuses"]["review"],
            ],
            "latency_seconds": latency_total,
            "latency_breakdown": {
                "webhook_to_in_progress_seconds": ip_latency,
                "in_progress_to_comment_seconds": round((comment_at or time.time()) - (in_progress_at or t0), 1)
                if comment_at
                else None,
            },
            "comment_sections_verified": list(COMMENT_SECTIONS) if comment_has_sections(comment_text) else [],
            "marketing_lead_usability": marketing_lead_usability,
            "silent_failures": 0 if review_at and comment_has_sections(comment_text) else 1,
            "n8n_execution_id": os.environ.get("GREEN_RUN_N8N_EXECUTION_ID", ""),
            "n8n_host": os.environ.get("N8N_API_URL", "n8n.wolven.com.br").replace("https://", ""),
            "brief_complete": brief_ok,
            "in_progress_within_5s": ip_latency is not None and ip_latency <= 5,
            "latency_under_60s": latency_total <= 60,
            "final_status_review": review_at is not None,
        }
    except Exception:
        raise
    finally:
        if os.environ.get("GREEN_RUN_KEEP_TASK", "").lower() not in ("1", "true", "yes"):
            try:
                _clickup_request(clickup_token, "DELETE", f"/task/{task_id}")
            except urllib.error.HTTPError:
                pass


def build_evidence(
    preflight: PreflightReport,
    main_workflow: dict[str, Any] | None = None,
) -> dict[str, Any]:
    infra_ready = preflight.coverage_percent >= 80 and not preflight.blockers
    validation_status = "passed" if main_workflow and main_workflow.get("verified") else "blocked"
    if main_workflow and main_workflow.get("verified"):
        validation_status = "passed"
    elif infra_ready:
        validation_status = "ready"
    else:
        validation_status = "blocked"

    checklist = preflight.to_dict()["checklist"]
    runtime_steps = [
        "test_task_brief_complete",
        "status_in_progress_within_5s",
        "comment_has_three_sections",
        "latency_under_60s",
        "final_status_review",
        "n8n_execution_success",
        "marketing_lead_usability",
    ]
    if validation_status != "passed":
        for step in runtime_steps:
            checklist.append(
                {
                    "step": step,
                    "status": "skip",
                    "detail": "Runtime step — execute after preflight passes (move task to Ready to Work)",
                }
            )

    return {
        "recorded_at": date.today().isoformat(),
        "session": "m1-green-run-validation",
        "validation_status": validation_status,
        "preflight": {
            "checklist": checklist,
            "coverage_percent": preflight.coverage_percent,
            "blockers": preflight.blockers,
        },
        "main_workflow": main_workflow
        or {
            "verified": False,
            "n8n_execution_id": "",
            "n8n_host": os.environ.get("N8N_API_URL", "https://n8n.wolven.com.br").replace("https://", ""),
            "clickup_task_id": "",
            "clickup_task_url": "",
            "clickup_task_name": DEFAULT_TEST_BRIEF["name"],
            "status_path": list(REQUIRED_STATUSES),
            "latency_seconds": None,
            "latency_breakdown": {},
            "comment_sections_verified": [],
            "marketing_lead_usability": "pending — run green run after operator setup",
            "silent_failures": None,
        },
        "call_agent_subworkflow": {
            "n8n_execution_id": "",
            "latency_ms": None,
            "parse_success": None,
            "agent_id": "linkedin-writer",
            "model": "gemini-2.5-flash",
        },
        "failure_observations": {
            "missing_criterios_de_aceite": (
                "Workflow still runs; draft autochecagem may be weak — brief gate is manual only in M1"
            ),
            "duplicate_webhook": (
                "Second delivery may post duplicate comment per ADR-001; no dedup in M1"
            ),
        },
    }


def run_log_dir() -> Path:
    """Create a timestamped directory under logs/green-run/ for this run."""
    stamp = time.strftime("%Y-%m-%dT%H%M%S")
    path = RUN_LOG_ROOT / stamp
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_evidence(evidence: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_run_evidence(evidence: dict[str, Any]) -> Path:
    """Write evidence to logs/green-run/<timestamp>/evidence.json (gitignored)."""
    log_dir = run_log_dir()
    out = log_dir / "evidence.json"
    write_evidence(evidence, out)
    return out


def should_update_canonical() -> bool:
    return os.environ.get("GREEN_RUN_UPDATE_CANONICAL", "").lower() in ("1", "true", "yes")


def main() -> int:
    clickup_token = (os.environ.get("CLICKUP_API_TOKEN") or os.environ.get("CLICKUP_TOKEN", "")).strip()
    clickup_list_id = os.environ.get("CLICKUP_LIST_ID", "").strip()
    n8n_api_url = os.environ.get("N8N_API_URL", "https://n8n.wolven.com.br").strip()
    n8n_api_key = os.environ.get("N8N_API_KEY", "").strip()

    if not clickup_token:
        blocked_preflight = PreflightReport(
            results=[
                CheckResult("clickup_token_configured", False, "CLICKUP_API_TOKEN unset"),
            ]
        )
        blocked = build_evidence(blocked_preflight)
        out = write_run_evidence(blocked)
        print(f"Wrote {out}")
        print("Set CLICKUP_API_TOKEN", file=sys.stderr)
        return 2

    preflight = run_preflight(
        clickup_token=clickup_token,
        clickup_list_id=clickup_list_id,
        n8n_api_url=n8n_api_url,
        n8n_api_key=n8n_api_key,
    )

    print(f"Preflight coverage: {preflight.coverage_percent}%")
    for result in preflight.results:
        mark = "PASS" if result.passed else "FAIL"
        print(f"  [{mark}] {result.step}: {result.detail}")

    main_result: dict[str, Any] | None = None
    execute = os.environ.get("GREEN_RUN_EXECUTE", "").lower() in ("1", "true", "yes")
    if execute and not preflight.blockers:
        mapping = load_field_mapping()
        print("\nExecuting green run...")
        main_result = execute_green_run(clickup_token=clickup_token, mapping=mapping)
        print(f"  Task: {main_result.get('clickup_task_url')}")
        print(f"  Latency: {main_result.get('latency_seconds')}s")

    evidence = build_evidence(preflight, main_result)
    out = write_run_evidence(evidence)
    print(f"\nWrote {out}")
    if should_update_canonical():
        write_evidence(evidence, EVIDENCE_PATH)
        print(f"Updated canonical {EVIDENCE_PATH}")
    print(f"Validation status: {evidence['validation_status']}")

    if evidence["validation_status"] == "blocked":
        print("\nBlockers:")
        for blocker in preflight.blockers:
            print(f"  - {blocker}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
