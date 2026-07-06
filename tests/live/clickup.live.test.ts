import { describe, expect, it } from "vitest";
import { loadRepoDotenv } from "../../src/load-env.js";
import { verify } from "../../src/clickup/verify-api.js";

function liveCredentials(): { token: string; listId: string } | undefined {
  const probe: NodeJS.ProcessEnv = { ...process.env };
  loadRepoDotenv(undefined, probe);
  const token = (probe.CLICKUP_API_TOKEN ?? probe.CLICKUP_TOKEN ?? "").trim();
  const listId = (probe.CLICKUP_LIST_ID ?? "").trim();
  return token && listId ? { token, listId } : undefined;
}

const credentials = liveCredentials();

describe.skipIf(!credentials)("clickup verify — live (requires CLICKUP_API_TOKEN, CLICKUP_LIST_ID)", () => {
  it("creates and deletes a test task on the Marketing Pipeline list with readable custom fields", async () => {
    const { token, listId } = credentials!;
    const taskId = await verify(token, listId, { cleanup: true });
    expect(taskId).toBeTruthy();
  });
});
