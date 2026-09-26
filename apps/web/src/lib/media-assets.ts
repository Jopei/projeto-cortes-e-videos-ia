import { api } from "@/lib/api";

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
  filename: string;
  storage_key: string;
  duration: number | null;
  status: MediaAssetStatus;
  created_at: string;
};

export function listMediaAssets(signal?: AbortSignal): Promise<MediaAsset[]> {
  return api.get<MediaAsset[]>("/api/media-assets", { signal });
}
