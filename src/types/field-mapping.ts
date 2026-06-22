export interface CustomFieldMapping {
  name: string;
  type: string;
  clickup_field_id: string;
  default?: string | number;
}

export interface FieldMapping {
  list_name?: string;
  clickup_list_id: string;
  custom_fields: Record<string, CustomFieldMapping>;
  statuses: Record<string, string>;
}

/** Keys in `statuses` used by M1 automation: ingress → writing → review. */
export const AUTOMATION_STATUS_KEYS = ["ready", "writing", "review"] as const;

export type AutomationStatusKey = (typeof AUTOMATION_STATUS_KEYS)[number];

export function automationStatusDisplayName(mapping: FieldMapping, key: AutomationStatusKey): string {
  return String(mapping.statuses?.[key] ?? "");
}

export function automationStatusDisplayNames(mapping: FieldMapping): string[] {
  return AUTOMATION_STATUS_KEYS.map((key) => automationStatusDisplayName(mapping, key));
}
