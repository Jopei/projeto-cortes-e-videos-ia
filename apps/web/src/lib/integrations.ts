import { api } from "@/lib/api";

/** Integrations are a superset of `PlatformValue` (adds "anthropic", used
 * for AI-generated titles/hashtags — not a publishing platform). */
export const INTEGRATION_IDS = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "bilibili",
  "vimeo",
  "anthropic",
] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export type IntegrationFieldSchema = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};

export type IntegrationSource = "db" | "env" | "mixed" | null;

/** Mirrors app/schemas/integration.py::IntegrationRead (admin-only). Secret
 * values in `values` come masked ("••••abcd") or null — never in the clear. */
export type Integration = {
  id: IntegrationId;
  name: string;
  fields: IntegrationFieldSchema[];
  values: Record<string, string | null>;
  configured: boolean;
  source: IntegrationSource;
  redirect_uri: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/** `""` or `null` clears the field; an omitted key leaves it unchanged. */
export type IntegrationUpdateInput = {
  values: Record<string, string | null>;
};

export type IntegrationTestResult = {
  ok: boolean;
  message: string;
};

export function listIntegrations(signal?: AbortSignal): Promise<Integration[]> {
  return api.get<Integration[]>("/api/admin/integrations", { signal });
}

export function getIntegration(id: IntegrationId, signal?: AbortSignal): Promise<Integration> {
  return api.get<Integration>(`/api/admin/integrations/${id}`, { signal });
}

export function updateIntegration(id: IntegrationId, payload: IntegrationUpdateInput): Promise<Integration> {
  return api.put<Integration>(`/api/admin/integrations/${id}`, payload);
}

export function clearIntegration(id: IntegrationId): Promise<void> {
  return api.delete<void>(`/api/admin/integrations/${id}`);
}

export function testIntegration(id: IntegrationId): Promise<IntegrationTestResult> {
  return api.post<IntegrationTestResult>(`/api/admin/integrations/${id}/test`, undefined);
}
