import { api } from "@/lib/api";
import type { Publication } from "@/lib/publications";

/** Mirrors app/schemas/dashboard.py::DashboardAttention. */
export type DashboardAttention = {
  clips_pending_review: number;
  episodes_awaiting_script_approval: number;
  episodes_pending_review: number;
  episodes_needs_attention: number;
  series_paused: number;
  publications_failed: number;
  jobs_failed_recent: number;
  total: number;
};

/** Mirrors app/schemas/dashboard.py::DashboardSummary. */
export type DashboardSummary = {
  uploads_total: number;
  jobs_active: number;
  clips_by_status: Record<string, number>;
  publications_by_status: Record<string, number>;
  upcoming_publications: Publication[];
  /** Optional: absent on older API builds (hide badges/strip then). */
  attention?: DashboardAttention;
};

export function getDashboardSummary(channelId?: string, signal?: AbortSignal): Promise<DashboardSummary> {
  const qs = channelId ? `?channel_id=${channelId}` : "";
  return api.get<DashboardSummary>(`/api/dashboard/summary${qs}`, { signal });
}
