import { resolve } from "node:path";
import { loadFieldMapping } from "../marketing-pipeline/logic.js";
import { loadRepoDotenv, REPO_ROOT } from "../load-env.js";
import { clickupDelete, clickupGet, clickupPost } from "./client.js";
import type { ClickUpClientOptions } from "./client.js";

export const FIELD_MAPPING_PATH = resolve(REPO_ROOT, "clickup", "field-mapping.json");

interface CustomFieldValue {
  id?: string;
  name?: string;
}

interface ClickUpTask {
  id: string;
  custom_fields?: CustomFieldValue[];
}

function fieldsByName(task: ClickUpTask): Map<string, CustomFieldValue> {
  return new Map(
    (task.custom_fields ?? [])
      .filter((cf): cf is CustomFieldValue & { name: string } => typeof cf.name === "string")
      .map((cf) => [cf.name, cf])
  );
}

export interface VerifyOptions {
  cleanup?: boolean;
  fieldMappingPath?: string;
  clientOptions?: Partial<Omit<ClickUpClientOptions, "token">>;
}

/**
 * Create a test task on `listId`, set its custom fields, read them back, then (by default) delete it.
 * Returns the created task ID.
 */
export async function verify(token: string, listId: string, options: VerifyOptions = {}): Promise<string> {
  const cleanup = options.cleanup ?? true;
  const mapping = loadFieldMapping(options.fieldMappingPath ?? FIELD_MAPPING_PATH);
  const clientOptions: ClickUpClientOptions = { token, ...options.clientOptions };

  const fieldIds = new Map<string, string>();
  for (const spec of Object.values(mapping.custom_fields)) {
    if (!spec.clickup_field_id || spec.clickup_field_id === "<TBD>") {
      throw new Error(`field-mapping.json has unset ID for ${JSON.stringify(spec.name)}`);
    }
    fieldIds.set(spec.name, spec.clickup_field_id);
  }

  const criteriosId = fieldIds.get("Critérios de Aceite");
  const agentFieldId = fieldIds.get("agent_id");
  if (!criteriosId || !agentFieldId) {
    throw new Error("field-mapping.json is missing expected custom field names");
  }

  const task = await clickupPost<{ id: string }>(
    `/list/${listId}/task`,
    {
      name: "[task_04] API verification task",
      description: "Automated test task — safe to delete.",
      status: "Backlog",
    },
    clientOptions
  );
  const taskId = task.id;

  try {
    await clickupPost(`/task/${taskId}/field/${criteriosId}`, { value: "Draft must mention Wolven brand voice." }, clientOptions);
    await clickupPost(`/task/${taskId}/field/${agentFieldId}`, { value: "linkedin-writer" }, clientOptions);

    const fetched = await clickupGet<ClickUpTask>(`/task/${taskId}`, clientOptions);
    const byName = fieldsByName(fetched);
    for (const name of fieldIds.keys()) {
      const cf = byName.get(name);
      if (!cf) {
        throw new Error(`GET task missing custom field: ${name}`);
      }
      if (!cf.id) {
        throw new Error(`Custom field ${name} has no id in response`);
      }
    }
    return taskId;
  } finally {
    if (cleanup) {
      try {
        await clickupDelete(`/task/${taskId}`, clientOptions);
      } catch {
        console.error(`Warning: could not delete test task ${taskId}`);
      }
    }
  }
}

/** CLI entrypoint logic: loads `.env`, runs verify, prints the result, returns the process exit code. */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  loadRepoDotenv(undefined, env);
  const token = (env.CLICKUP_API_TOKEN ?? env.CLICKUP_TOKEN ?? "").trim();
  const listId = (env.CLICKUP_LIST_ID ?? "").trim();
  if (!token || !listId) {
    console.error("Set CLICKUP_API_TOKEN and CLICKUP_LIST_ID");
    return 1;
  }

  try {
    const taskId = await verify(token, listId);
    console.log(`OK: custom fields readable on task ${taskId} (deleted after verify)`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
