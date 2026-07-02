import { describe, expect, it, vi } from "vitest";
import { summarizeProof, printFailures, type EvidenceRow } from "../src/proof/result-summary.js";

describe("proof exit-code contract", () => {
  describe("summarizeProof()", () => {
    it("returns exit code 0 when local proof passes and no rows fail", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All statuses present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "LOCAL-GATES",
          status: "pass",
          action: "Check gates",
          observed: "All gates correct",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).toBe(0);
      expect(summary.failedRows).toHaveLength(0);
      expect(summary.totalRows).toBe(2);
    });

    it("returns exit code 1 when local proof fails (passed: false)", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "fail",
          action: "Check statuses",
          observed: "Missing statuses",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, false);

      expect(summary.exitCode).toBe(1);
      expect(summary.failedRows).toHaveLength(1);
      expect(summary.totalRows).toBe(1);
    });

    it("returns exit code 2 when local proof passed but live rows have fail status", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All statuses present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A1",
          status: "fail",
          action: "Read live list statuses",
          endpoint: "GET /api/v2/list/{list_id}",
          observed: "Some required statuses missing",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).toBe(2);
      expect(summary.failedRows).toHaveLength(1);
      expect(summary.failedRows[0].id).toBe("A1");
    });

    it("returns exit code 1 over 2 when both local fails and live has fail rows", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "fail",
          action: "Check statuses",
          observed: "Missing statuses",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A1",
          status: "fail",
          action: "Read live list statuses",
          endpoint: "GET /api/v2/list/{list_id}",
          observed: "Additional failure",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, false);

      expect(summary.exitCode).toBe(1);
      expect(summary.failedRows).toHaveLength(2);
    });

    it("ignores observe rows — they do not cause failures", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All statuses present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A8-A9",
          status: "observe",
          action: "Inspect workflow readiness",
          endpoint: "GET /api/v1/executions",
          observed: "Workflow not yet staged; can observe for future readiness",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).toBe(0);
      expect(summary.failedRows).toHaveLength(0);
    });

    it("collects only fail-status rows into failedRows", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-GATES",
          status: "pass",
          action: "Check gates",
          observed: "All gates correct",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A1",
          status: "fail",
          action: "Read live list statuses",
          endpoint: "GET /api/v2/list/{list_id}",
          observed: "Failure 1",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A5",
          status: "fail",
          action: "Replace stage page",
          endpoint: "PUT /api/v3/docs/{doc_id}/pages/{page_id}",
          observed: "Failure 2",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A19",
          status: "observe",
          action: "Latency measurement",
          observed: "Cannot measure yet",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).toBe(2);
      expect(summary.failedRows).toHaveLength(2);
      expect(summary.failedRows[0].id).toBe("A1");
      expect(summary.failedRows[1].id).toBe("A5");
    });
  });

  describe("printFailures()", () => {
    it("prints nothing when exit code is 0", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All present",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);
      printFailures(summary);

      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("prints header and failures when exit code is 1", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "fail",
          action: "Check statuses",
          observed: "Missing required statuses",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, false);
      printFailures(summary);

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Content Quality Proof: Failures Detected"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[LOCAL-STATUSES]"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Check statuses"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Local proof failed"));

      consoleError.mockRestore();
    });

    it("prints header and failures when exit code is 2", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A1",
          status: "fail",
          action: "Read live list statuses",
          endpoint: "GET /api/v2/list/{list_id}",
          observed: "Some statuses missing in live",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);
      printFailures(summary);

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Content Quality Proof: Failures Detected"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[A1]"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Read live list statuses"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Live proof encountered failures"));

      consoleError.mockRestore();
    });

    it("prints each failed row with ID, status, and observed details", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const rows: EvidenceRow[] = [
        {
          id: "A1",
          status: "fail",
          action: "Read live list statuses",
          endpoint: "GET /api/v2/list/{list_id}",
          observed: "Failure detail 1",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A5",
          status: "fail",
          action: "Replace stage page",
          endpoint: "PUT /docs/{doc_id}",
          observed: "Failure detail 2",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);
      printFailures(summary);

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[A1]"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Status: fail"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Failure detail 1"));

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[A5]"));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Failure detail 2"));

      consoleError.mockRestore();
    });
  });

  describe("proof script exit code integration", () => {
    it("local proof with all-pass rows exits 0", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "LOCAL-GATES",
          status: "pass",
          action: "Check gates",
          observed: "All correct",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).toBe(0);
      expect(summary.failedRows).toHaveLength(0);
    });

    it("local proof with failed rows exits non-zero", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "fail",
          action: "Check statuses",
          observed: "Missing stages",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, false);

      expect(summary.exitCode).not.toBe(0);
      expect(summary.exitCode).toBe(1);
    });

    it("live proof with fail rows exits non-zero (exit code 2)", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A1",
          status: "fail",
          action: "Read live statuses",
          endpoint: "GET /list",
          observed: "Cannot reach ClickUp",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).not.toBe(0);
      expect(summary.exitCode).toBe(2);
    });

    it("observe-only rows do not fail the run", () => {
      const rows: EvidenceRow[] = [
        {
          id: "LOCAL-STATUSES",
          status: "pass",
          action: "Check statuses",
          observed: "All present",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A8",
          status: "observe",
          action: "Workflow readiness",
          endpoint: "GET /workflows",
          observed: "Single-agent workflow present; staged workflow not yet deployed",
          timestamp: "2026-07-02T00:00:00Z",
        },
        {
          id: "A19",
          status: "observe",
          action: "Latency measurement",
          observed: "Cannot measure live latency in local mode",
          timestamp: "2026-07-02T00:00:00Z",
        },
      ];

      const summary = summarizeProof(rows, true);

      expect(summary.exitCode).toBe(0);
      expect(summary.failedRows).toHaveLength(0);
      expect(summary.totalRows).toBe(3);
    });
  });
});
