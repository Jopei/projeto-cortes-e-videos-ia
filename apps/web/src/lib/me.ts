import { api } from "@/lib/api";

/** Mirrors app/schemas/user.py::UsageRead (own usage — `GET /api/me/usage`;
 * the same shape is embedded per-user in `AdminUserRead`, see lib/admin-users.ts). */
export type UsageRead = {
  storage_used_bytes: number;
  storage_quota_bytes: number | null;
  analyses_today: number;
  daily_analysis_quota: number | null;
  channels_count: number;
  max_channels: number | null;
  active_series: number;
  max_active_series: number | null;
  ai_spend_month_usd: number;
  monthly_ai_budget_usd: number | null;
};

export function getMyUsage(signal?: AbortSignal): Promise<UsageRead> {
  return api.get<UsageRead>("/api/me/usage", { signal });
}

/** `null` quota means unlimited — never show a bar/percentage for it. */
export function usageRatio(used: number, quota: number | null): number | null {
  if (quota === null || quota <= 0) return null;
  return Math.min(1, used / quota);
}
