import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFieldMapping } from "../marketing-pipeline/logic.js";
import { loadRepoDotenv, REPO_ROOT } from "../load-env.js";
import type { FieldMapping } from "../types/field-mapping.js";
import { clickupGet } from "./client.js";
import type { ClickUpClientOptions } from "./client.js";

export const FIELD_MAPPING_PATH = resolve(REPO_ROOT, "clickup", "field-mapping.json");

/** ClickUp custom field display name -> field-mapping.json `custom_fields` key. */
const EXPECTED_FIELDS: Record<string, string> = {
  "Critérios de Aceite": "criterios_de_aceite",
  agent_id: "agent_id",
  revision_count: "revision_count",
};

interface ListDetailResponse {
  name?: string;
}

interface ListFieldsResponse {
  fields?: Array<{ id: string; name: string }>;
}

export class MissingCustomFieldsError extends Error {
  constructor(listId: string, missing: string[]) {
    super(
      `Missing custom fields on list ${listId}: ${missing.join(", ")}. ` +
        "Create them in ClickUp UI per clickup/list-schema.md"
    );
    this.name = "MissingCustomFieldsError";
  }
}

export interface SyncFieldMappingOptions {
  fieldMappingPath?: string;
  clientOptions?: Partial<Omit<ClickUpClientOptions, "token">>;
}

/** Fetch the live list + field IDs from ClickUp and rewrite `field-mapping.json` to match. */
export async function syncFieldMapping(
  token: string,
  listId: string,
  options: SyncFieldMappingOptions = {}
): Promise<FieldMapping> {
  const fieldMappingPath = options.fieldMappingPath ?? FIELD_MAPPING_PATH;
  const mapping = loadFieldMapping(fieldMappingPath);
  const clientOptions: ClickUpClientOptions = { token, ...options.clientOptions };

  const listData = await clickupGet<ListDetailResponse>(`/list/${listId}`, clientOptions);
  if (listData.name !== mapping.list_name) {
    console.error(`Warning: list name is ${JSON.stringify(listData.name)}, expected ${JSON.stringify(mapping.list_name)}`);
  }

  const fieldsResp = await clickupGet<ListFieldsResponse>(`/list/${listId}/field`, clientOptions);
  const fieldsByName = new Map((fieldsResp.fields ?? []).map((f) => [f.name, f.id]));

  const missing = Object.keys(EXPECTED_FIELDS).filter((name) => !fieldsByName.has(name));
  if (missing.length > 0) {
    throw new MissingCustomFieldsError(listId, missing);
  }

  const updated: FieldMapping = {
    ...mapping,
    clickup_list_id: listId,
    custom_fields: { ...mapping.custom_fields },
  };
  for (const [clickupName, key] of Object.entries(EXPECTED_FIELDS)) {
    const fieldId = fieldsByName.get(clickupName);
    const existing = updated.custom_fields[key];
    if (fieldId === undefined || existing === undefined) {
      throw new Error(`Cannot map ClickUp field ${JSON.stringify(clickupName)} to custom_fields.${key}`);
    }
    updated.custom_fields[key] = { ...existing, clickup_field_id: fieldId };
  }

  writeFileSync(fieldMappingPath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  return updated;
}

/** CLI entrypoint logic: loads `.env`, runs the sync, prints a summary, returns the process exit code. */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  loadRepoDotenv(undefined, env);
  const token = (env.CLICKUP_API_TOKEN ?? env.CLICKUP_TOKEN ?? "").trim();
  const listId = (env.CLICKUP_LIST_ID ?? "").trim();
  if (!token || !listId) {
    console.error(
      "Set CLICKUP_API_TOKEN and CLICKUP_LIST_ID.\n" +
        "Example: CLICKUP_API_TOKEN=pk_xxx CLICKUP_LIST_ID=123456 pnpm clickup:sync"
    );
    return 1;
  }

  try {
    const mapping = await syncFieldMapping(token, listId);
    console.log(`Updated ${FIELD_MAPPING_PATH}`);
    console.log(`  list_id: ${mapping.clickup_list_id}`);
    for (const [key, field] of Object.entries(mapping.custom_fields)) {
      console.log(`  ${key}: ${field.clickup_field_id}`);
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
