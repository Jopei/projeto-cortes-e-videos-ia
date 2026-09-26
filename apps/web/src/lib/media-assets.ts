import { api, API_URL } from "@/lib/api";
import type { AnalysisParams } from "@/lib/channels";
import type { AnalysisJob, Preset } from "@/lib/jobs";

/** Mirrors app/models/media_asset.py::MediaAssetStatus. */
export type MediaAssetStatus = "uploaded" | "analyzing" | "ready" | "failed";

export const MEDIA_ASSET_STATUS_LABELS: Record<MediaAssetStatus, string> = {
  uploaded: "Enviado",
  analyzing: "Analisando",
  ready: "Pronto",
  failed: "Falhou",
};

/** Mirrors app/schemas/media_asset.py::MediaAssetRead. */
export type MediaAsset = {
  id: string;
  source_id: string;
  channel_id: string | null;
  filename: string;
  storage_key: string;
  duration: number | null;
  status: MediaAssetStatus;
  created_at: string;
};

export function listMediaAssets(channelId?: string, signal?: AbortSignal): Promise<MediaAsset[]> {
  const qs = channelId ? `?channel_id=${channelId}` : "";
  return api.get<MediaAsset[]>(`/api/media-assets${qs}`, { signal });
}

export function getMediaAsset(id: string, signal?: AbortSignal): Promise<MediaAsset> {
  return api.get<MediaAsset>(`/api/media-assets/${id}`, { signal });
}

export function updateMediaAsset(id: string, payload: { channel_id: string | null }): Promise<MediaAsset> {
  return api.patch<MediaAsset>(`/api/media-assets/${id}`, payload);
}

export function mediaAssetVideoUrl(id: string): string {
  return `${API_URL}/api/media-assets/${id}/video`;
}

/** Mirrors app/schemas/analysis_job.py::AnalyzeRequest. */
export type AnalyzeInput = {
  preset?: Preset | null;
  params?: AnalysisParams | null;
  channel_id?: string | null;
};

export function analyzeMediaAsset(id: string, payload: AnalyzeInput): Promise<AnalysisJob> {
  return api.post<AnalysisJob>(`/api/media-assets/${id}/analyze`, payload);
}
