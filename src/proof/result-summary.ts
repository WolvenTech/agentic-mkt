export type EvidenceStatus = "pass" | "fail" | "blocked" | "observe" | "skip";

export interface EvidenceRow {
  id: string;
  status: EvidenceStatus;
  action: string;
  endpoint?: string;
  observed: string;
  timestamp: string;
}

export interface ProofSummary {
  exitCode: 0 | 1 | 2;
  failedRows: EvidenceRow[];
  totalRows: number;
}

export function summarizeProof(rows: EvidenceRow[], localPassed: boolean): ProofSummary {
  const failedRows = rows.filter((r) => r.status === "fail");
  let exitCode: 0 | 1 | 2 = 0;

  if (!localPassed) {
    exitCode = 1;
  } else if (failedRows.length > 0) {
    exitCode = 2;
  }

  return {
    exitCode,
    failedRows,
    totalRows: rows.length,
  };
}

export function printFailures(summary: ProofSummary): void {
  if (summary.exitCode === 0) {
    return;
  }

  console.error("\n" + "=".repeat(60));
  console.error("Content Quality Proof: Failures Detected");
  console.error("=".repeat(60));

  for (const failedRow of summary.failedRows) {
    console.error(`\n[${failedRow.id}] ${failedRow.action}`);
    console.error(`  Status: ${failedRow.status}`);
    console.error(`  Observed: ${failedRow.observed}`);
  }

  if (summary.exitCode === 1) {
    console.error(
      "\nLocal proof failed. Review staged status definitions, stage pages, and stage gate routing."
    );
  } else if (summary.exitCode === 2) {
    console.error(
      "\nLive proof encountered failures. Check the JSON evidence file for detailed diagnostics."
    );
  }

  console.error("=".repeat(60));
}
