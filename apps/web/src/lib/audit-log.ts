import { api } from "@/lib/api";

/** Mirrors app/schemas/audit_log.py::AuditLogRead. */
export type AuditLogEntry = {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export function listAuditLog(
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<AuditLogEntry[]> {
  return api.get<AuditLogEntry[]>(`/api/audit-log?limit=${limit}&offset=${offset}`, { signal });
}
