import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");

const GITIGNORE_SECRET_PATTERNS = [/^\.env$/, /^\*\.pem$/, /credential/];

function runGit(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" });
}

describe("git repository", () => {
  it("is initialized at the repo root", () => {
    expect(() => runGit("rev-parse", "--is-inside-work-tree")).not.toThrow();
  });

  it("runs git status from the repo root without error", () => {
    expect(() => runGit("status", "--porcelain")).not.toThrow();
  });
});

describe(".gitignore", () => {
  const gitignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf-8");
  const lines = gitignore
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  it("excludes secret-bearing patterns", () => {
    for (const pattern of GITIGNORE_SECRET_PATTERNS) {
      expect(lines.some((line) => pattern.test(line))).toBe(true);
    }
  });

  it("excludes .env but allows .env.example", () => {
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("!.env.example");
  });

  it("ignores node_modules", () => {
    expect(lines).toContain("node_modules/");
  });

  it("ignores logs/** except the README and .gitkeep allowlist", () => {
    const isIgnored = (path: string) => {
      try {
        runGit("check-ignore", path);
        return true;
      } catch {
        return false;
      }
    };
    expect(isIgnored("logs/green-run/2026-06-22T000000/evidence.json")).toBe(true);
    expect(isIgnored("logs/README.md")).toBe(false);
    expect(isIgnored("logs/.gitkeep")).toBe(false);
  });
});
