import { api } from "@/lib/api";
import type { Publication } from "@/lib/publications";

/** Mirrors app/schemas/dashboard.py::DashboardSummary. */
export type DashboardSummary = {
  uploads_total: number;
  jobs_active: number;
  clips_by_status: Record<string, number>;
  publications_by_status: Record<string, number>;
  upcoming_publications: Publication[];
};

export function getDashboardSummary(channelId?: string, signal?: AbortSignal): Promise<DashboardSummary> {
  const qs = channelId ? `?channel_id=${channelId}` : "";
  return api.get<DashboardSummary>(`/api/dashboard/summary${qs}`, { signal });
}
