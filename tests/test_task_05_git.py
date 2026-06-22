#!/usr/bin/env python3
"""Task 05 git repository and GitHub fetch validation tests."""

from __future__ import annotations

import base64
import json
import re
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

M1_COMMIT_PATHS = [
    "agents/linkedin-writer.json",
    "agents/skills/wolven-voice.md",
    "agents/skills/linkedin-format.md",
    "agent-harness/io-contract.md",
    "agent-harness/output-schema.json",
    "clickup/field-mapping.json",
    "clickup/webhook-contract.md",
    "n8n/README.md",
]

GITIGNORE_SECRET_PATTERNS = [
    r"^\.env$",
    r"^\*\.pem$",
    r"credential",
]

GITHUB_FETCH_PATHS = [
    "agents/linkedin-writer.json",
    "agents/skills/wolven-voice.md",
    "agents/skills/linkedin-format.md",
]


def _run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _parse_github_remote() -> tuple[str, str, str] | None:
    result = _run_git("remote", "get-url", "origin")
    if result.returncode != 0:
        return None
    url = result.stdout.strip()
    match = re.match(
        r"(?:https://github\.com/|git@github\.com:)([^/]+)/([^/.]+?)(?:\.git)?$",
        url,
    )
    if not match:
        return None
    owner, repo = match.group(1), match.group(2)
    branch = _run_git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "main"
    return owner, repo, branch


def _fetch_github_content(owner: str, repo: str, path: str) -> str:
    """Fetch file content via GitHub API (works for private repos with gh auth)."""
    result = subprocess.run(
        ["gh", "api", f"repos/{owner}/{repo}/contents/{path}", "--jq", ".content"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh api failed for {path}: {result.stderr.strip()}")
    encoded = result.stdout.strip().strip('"')
    return base64.b64decode(encoded).decode("utf-8")


class TestTask05GitIgnore(unittest.TestCase):
    def test_gitignore_excludes_secret_patterns(self) -> None:
        gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        lines = {line.strip() for line in gitignore.splitlines() if line.strip() and not line.startswith("#")}
        for pattern in GITIGNORE_SECRET_PATTERNS:
            self.assertTrue(
                any(re.search(pattern, line) for line in lines),
                f".gitignore missing pattern matching {pattern!r}",
            )

    def test_gitignore_excludes_env_but_allows_example(self) -> None:
        gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn(".env", gitignore)
        self.assertIn("!.env.example", gitignore)


class TestTask05GitRepository(unittest.TestCase):
    def test_git_repository_initialized(self) -> None:
        self.assertTrue((REPO_ROOT / ".git").is_dir(), "Git repository not initialized")

    def test_git_status_clean_after_commit(self) -> None:
        result = _run_git("status", "--porcelain")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.strip(),
            "",
            f"Working tree not clean:\n{result.stdout}",
        )

    def test_initial_commit_includes_m1_artifacts(self) -> None:
        result = _run_git("ls-tree", "-r", "--name-only", "HEAD")
        self.assertEqual(result.returncode, 0, result.stderr)
        committed = set(result.stdout.splitlines())
        missing = [p for p in M1_COMMIT_PATHS if p not in committed]
        self.assertEqual(missing, [], f"Initial commit missing paths: {missing}")

    def test_no_secrets_tracked(self) -> None:
        result = _run_git("ls-files")
        self.assertEqual(result.returncode, 0, result.stderr)
        tracked = result.stdout.splitlines()
        forbidden = [
            p
            for p in tracked
            if p == ".env"
            or p.endswith(".pem")
            or "credential" in p.lower()
            or p.startswith(".compozy/")
        ]
        self.assertEqual(forbidden, [], f"Secrets or tracking files committed: {forbidden}")


class TestTask05GitHubFetch(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.remote = _parse_github_remote()

    def test_github_remote_configured(self) -> None:
        self.assertIsNotNone(self.remote, "origin remote must point to GitHub")

    def test_agent_json_fetchable_via_github_api(self) -> None:
        self.assertIsNotNone(self.remote)
        owner, repo, _branch = self.remote  # type: ignore[misc]
        body = _fetch_github_content(owner, repo, "agents/linkedin-writer.json")
        data = json.loads(body)
        self.assertEqual(data.get("id"), "linkedin-writer")

    def test_skill_files_fetchable_via_github_api(self) -> None:
        self.assertIsNotNone(self.remote)
        owner, repo, _branch = self.remote  # type: ignore[misc]
        for path in ("agents/skills/wolven-voice.md", "agents/skills/linkedin-format.md"):
            content = _fetch_github_content(owner, repo, path)
            self.assertTrue(len(content.strip()) > 0, f"{path} returned empty content")

    def test_all_github_fetch_paths_reachable(self) -> None:
        self.assertIsNotNone(self.remote)
        owner, repo, _branch = self.remote  # type: ignore[misc]
        for path in GITHUB_FETCH_PATHS:
            content = _fetch_github_content(owner, repo, path)
            self.assertTrue(len(content.strip()) > 0, f"{path} returned empty content")


if __name__ == "__main__":
    unittest.main(verbosity=2)
