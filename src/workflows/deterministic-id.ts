import { createHash } from "node:crypto";

/** Bump when export shape or ID scheme changes so committed JSON can be regenerated deliberately. */
export const WORKFLOW_EXPORT_VERSION = "1";

/** Stable UUID-shaped ID from workflow name, node (or scope) name, and export version. */
export function deterministicWorkflowId(
  workflowName: string,
  scopeName: string,
  exportVersion: string = WORKFLOW_EXPORT_VERSION
): string {
  const hash = createHash("sha256")
    .update(`${workflowName}\0${scopeName}\0${exportVersion}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
