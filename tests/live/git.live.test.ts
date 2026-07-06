import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");

const GITHUB_FETCH_PATHS = [
  "agents/investigative-brief.json",
  "agents/skills/wolven-voice.md",
  "agents/skills/investigative-brief.md",
];

interface GithubRemote {
  owner: string;
  repo: string;
}

function parseGithubRemote(): GithubRemote | undefined {
  let url: string;
  try {
    url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
  const match = url.match(/(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (!match) return undefined;
  const [, owner, repo] = match;
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

function ghAuthenticated(): boolean {
  try {
    execFileSync("gh", ["auth", "status"], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fetchGithubContent(owner: string, repo: string, path: string): string {
  const output = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/contents/${path}`, "--jq", ".content"],
    { cwd: REPO_ROOT, encoding: "utf-8" }
  );
  const encoded = output.trim().replace(/^"|"$/g, "");
  return Buffer.from(encoded, "base64").toString("utf-8");
}

const remote = parseGithubRemote();
const authenticated = remote ? ghAuthenticated() : false;

describe.skipIf(!remote || !authenticated)(
  "GitHub fetch — live (requires GitHub remote + authenticated gh CLI)",
  () => {
    it("resolves a GitHub remote on origin", () => {
      expect(remote).toBeDefined();
    });

    it("fetches the agent config via the GitHub API", () => {
      const { owner, repo } = remote!;
      const body = fetchGithubContent(owner, repo, "agents/investigative-brief.json");
      const data = JSON.parse(body) as { id?: string };
      expect(data.id).toBe("investigative-brief");
    });

    it("fetches every skill file via the GitHub API", () => {
      const { owner, repo } = remote!;
      for (const path of ["agents/skills/wolven-voice.md", "agents/skills/investigative-brief.md"]) {
        const content = fetchGithubContent(owner, repo, path);
        expect(content.trim().length).toBeGreaterThan(0);
      }
    });

    it("reaches every GitHub fetch path used by the Call Agent sub-workflow", () => {
      const { owner, repo } = remote!;
      for (const path of GITHUB_FETCH_PATHS) {
        const content = fetchGithubContent(owner, repo, path);
        expect(content.trim().length).toBeGreaterThan(0);
      }
    });
  }
);
