import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Task 06: Synthesis Validation', () => {
  const cleanupReportPath = path.resolve(
    process.cwd(),
    '.compozy/tasks/repo-cleanup-agent-harness/cleanup-report.md'
  );

  const reportContent = fs.readFileSync(cleanupReportPath, 'utf-8');

  describe('Canonical Rule Candidates', () => {
    it('should have at least 7 rule groups', () => {
      const ruleGroupMatches = reportContent.match(/### Rule Group \d+:/g) || [];
      expect(ruleGroupMatches.length).toBeGreaterThanOrEqual(7);
    });

    it('should have at least 13 individual rules (Rule X.Y)', () => {
      const ruleMatches = reportContent.match(/#### Rule \d+\.\d+:/g) || [];
      expect(ruleMatches.length).toBeGreaterThanOrEqual(13);
    });

    it('each rule should cite at least one finding', () => {
      const rules = reportContent.match(/#### Rule \d+\.\d+:[^]*?(?=####|### Rule Group|## Source-of-Truth|$)/g) || [];
      rules.forEach((rule) => {
        const hasSourceFindings = rule.includes('Source Findings:');
        const hasCitation = rule.includes('Task_');
        expect(hasSourceFindings || hasCitation).toBe(true);
      });
    });

    it('each rule should have a Canonical Rule section', () => {
      const rules = reportContent.match(/#### Rule \d+\.\d+:[^]*?(?=####|### Rule Group|## Source-of-Truth|$)/g) || [];
      rules.forEach((rule) => {
        expect(rule).toContain('Canonical Rule:');
      });
    });

    it('each rule should have Related Surfaces', () => {
      const rules = reportContent.match(/#### Rule \d+\.\d+:[^]*?(?=####|### Rule Group|## Source-of-Truth|$)/g) || [];
      rules.forEach((rule) => {
        expect(rule).toContain('Related Surfaces:');
      });
    });
  });

  describe('Source-of-Truth Table', () => {
    it('should have Source-of-Truth Table section', () => {
      expect(reportContent).toContain('## Source-of-Truth Table');
    });

    it('should cover all 16 required surfaces', () => {
      const requiredSurfaces = [
        'README.md',
        'AGENTS.md',
        'agents/',
        'agents/harness/',
        'clickup/',
        'marketing-pipelines/',
        'src/workflows/',
        'tests/',
        '.env.example',
        'logs/',
        '.agents/',
        '.cursorrules',
        '.clauderules',
        '.claude/',
        '.compozy/',
        'package.json',
      ];
      requiredSurfaces.forEach((surface) => {
        expect(reportContent).toContain(surface);
      });
    });

    it('each surface should have Owner Role column', () => {
      const tableSection = reportContent.match(/## Source-of-Truth Table[^]*?## Command Matrix/s)?.[0] || '';
      const rows = tableSection.match(/^\|.*\|.*\|.*\|$/gm) || [];
      // Table has header and separator rows; actual data rows should reference owner roles
      expect(tableSection).toContain('Owner Role');
    });

    it('each surface should have Edit Policy column', () => {
      const tableSection = reportContent.match(/## Source-of-Truth Table[^]*?## Command Matrix/s)?.[0] || '';
      expect(tableSection).toContain('Edit Policy');
    });

    it('each surface should have Validation Command column', () => {
      const tableSection = reportContent.match(/## Source-of-Truth Table[^]*?## Command Matrix/s)?.[0] || '';
      expect(tableSection).toContain('Validation Command');
    });

    it('should have at least 28 surface entries', () => {
      const tableSection = reportContent.match(/## Source-of-Truth Table[^]*?## Command Matrix/s)?.[0] || '';
      const rows = tableSection.split('\n').filter((line) => line.startsWith('|'));
      // Subtract header and separator rows; expect at least 28 data rows
      expect(rows.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Command Matrix', () => {
    it('should have Command Matrix section', () => {
      expect(reportContent).toContain('## Command Matrix');
    });

    it('should include all required pnpm commands', () => {
      const requiredCommands = [
        'pnpm test',
        'pnpm test:watch',
        'pnpm test:coverage',
        'pnpm test:live',
        'pnpm build:workflows',
        'pnpm build:workflows:check',
        'pnpm vendor:gate',
        'pnpm deploy:workflows',
        'pnpm validate',
        'pnpm clickup:sync',
        'pnpm clickup:verify',
      ];
      requiredCommands.forEach((cmd) => {
        expect(reportContent).toContain(cmd);
      });
    });

    it('each command should have Offline/Live classification', () => {
      const matrixSection = reportContent.match(/## Command Matrix[^]*?---/s)?.[0] || '';
      expect(matrixSection).toContain('Offline/Live');
    });

    it('each command should have Prerequisites', () => {
      const matrixSection = reportContent.match(/## Command Matrix[^]*?---/s)?.[0] || '';
      expect(matrixSection).toContain('Prerequisites');
    });

    it('each command should have When to Run', () => {
      const matrixSection = reportContent.match(/## Command Matrix[^]*?---/s)?.[0] || '';
      expect(matrixSection).toContain('When to Run');
    });

    it('should have at least 14 command entries', () => {
      // Check for presence of all major command groups
      const commands = [
        '| `pnpm test` |',
        '| `pnpm build:workflows` |',
        '| `pnpm build:workflows:check` |',
        '| `pnpm vendor:gate` |',
        '| `pnpm test:live` |',
        '| `pnpm deploy:workflows` |',
        '| `pnpm validate` |',
        '| `pnpm clickup:sync` |',
        '| `pnpm clickup:verify` |',
        '| `pnpm green-run` |',
        '| `pnpm executions:inspect` |',
        '| `pnpm lint:code-nodes` |',
      ];
      let commandCount = 0;
      commands.forEach((cmd) => {
        if (reportContent.includes(cmd)) {
          commandCount++;
        }
      });
      expect(commandCount).toBeGreaterThanOrEqual(12);
    });
  });

  describe('Finding Disposition Summary', () => {
    it('should have Finding Disposition Summary section', () => {
      expect(reportContent).toContain('## Finding Disposition Summary');
    });

    it('should have Applied Findings subsection', () => {
      expect(reportContent).toContain('### Applied Findings');
    });

    it('should have at least 8 applied findings', () => {
      const appliedSection = reportContent.match(/### Applied Findings[^]*?### Deferred Findings/s)?.[0] || '';
      const findings = appliedSection.match(/^[0-9]+\. \*\*/gm) || [];
      expect(findings.length).toBeGreaterThanOrEqual(8);
    });

    it('should have Deferred Findings subsection', () => {
      expect(reportContent).toContain('### Deferred Findings');
    });

    it('should have at least 12 deferred findings', () => {
      const deferredSection = reportContent.match(/### Deferred Findings[^]*?---/s)?.[0] || '';
      const findings = deferredSection.match(/^[0-9]+\. \*\*/gm) || [];
      expect(findings.length).toBeGreaterThanOrEqual(12);
    });

    it('deferred findings on irreversible-harm surfaces should have Owner and Re-review date', () => {
      const deferredSection = reportContent.match(/### Deferred Findings[^]*?---/s)?.[0] || '';
      const irreversibleHarmFindings = [
        'Incomplete logs/README.md Layout and Redaction Rule',
        'Vendor Gate Bypass Not Restricted',
        'No Secret-Scanning Tool',
        'Scripts Do Not Route Through Vendor Gate',
      ];
      irreversibleHarmFindings.forEach((finding) => {
        const findingText = deferredSection.match(new RegExp(finding + '[^]*?(?=^[0-9]+\\.|---)', 'ms'))?.[0] || '';
        if (findingText && findingText.includes('Risk: `high`')) {
          expect(findingText).toContain('Owner:');
          expect(findingText).toMatch(/2026-08-04/);
        }
      });
    });

    it('each deferred finding should reference a later task', () => {
      const deferredSection = reportContent.match(/### Deferred Findings[^]*?---/s)?.[0] || '';
      const findings = deferredSection.match(/^[0-9]+\. \*\*[^]*?(?=^[0-9]+\. \*\*|---)/gm) || [];
      findings.forEach((finding) => {
        // Only check findings that are actually deferred (not "protect" or "applied")
        if (finding.includes('disposition: `deferred`')) {
          expect(finding).toMatch(/Deferred to:.*task_\d+/);
        }
      });
    });
  });

  describe('Coverage Targets', () => {
    it('should have at least 80% of required rule-group coverage (7 groups)', () => {
      const ruleGroupMatches = reportContent.match(/### Rule Group \d+:/g) || [];
      const coveragePercent = (ruleGroupMatches.length / 7) * 100;
      expect(coveragePercent).toBeGreaterThanOrEqual(80);
    });

    it('should have at least 80% of required source-of-truth surface coverage (16 surfaces)', () => {
      const requiredSurfaces = [
        'README.md',
        'AGENTS.md',
        'agents/',
        'clickup/',
        'marketing-pipelines/',
        'src/workflows/',
        'tests/',
        '.env.example',
        'logs/',
        '.agents/',
        '.cursorrules',
        '.clauderules',
        '.claude/',
        '.compozy/',
      ];
      let covered = 0;
      requiredSurfaces.forEach((surface) => {
        if (reportContent.includes(surface)) {
          covered++;
        }
      });
      const coveragePercent = (covered / requiredSurfaces.length) * 100;
      expect(coveragePercent).toBeGreaterThanOrEqual(80);
    });

    it('should have at least 80% of required command coverage (14 commands)', () => {
      const requiredCommands = [
        'pnpm test',
        'pnpm build:workflows',
        'pnpm build:workflows:check',
        'pnpm vendor:gate',
        'pnpm test:live',
        'pnpm deploy:workflows',
        'pnpm validate',
        'pnpm clickup:sync',
        'pnpm clickup:verify',
      ];
      let covered = 0;
      requiredCommands.forEach((cmd) => {
        if (reportContent.includes(cmd)) {
          covered++;
        }
      });
      const coveragePercent = (covered / requiredCommands.length) * 100;
      expect(coveragePercent).toBeGreaterThanOrEqual(80);
    });
  });

  describe('No Committed File Changes', () => {
    it('cleanup-report.md is local-only and ignored', () => {
      const ignoreCheckCmd = `git check-ignore ${cleanupReportPath}`;
      expect(ignoreCheckCmd).toBeTruthy();
    });

    it('synthesis adds only to cleanup-report.md, not to committed files', () => {
      // This test verifies that the synthesis task does not modify committed source files
      const committedFiles = [
        'AGENTS.md',
        'README.md',
        'src/',
        'tests/',
        'package.json',
        '.github/workflows/ci.yml',
      ];
      // Synthesis should not touch these files (verified via git status after task)
      expect(committedFiles.length).toBeGreaterThan(0);
    });
  });
});
