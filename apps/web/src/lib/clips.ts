import { api, API_URL } from "@/lib/api";
import type { PlatformValue } from "@/lib/channels";

/** Mirrors app/models/clip.py::ClipStatus. */
export type ClipStatus = "rendering" | "pending_review" | "approved" | "rejected" | "failed";

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  rendering: "Renderizando",
  pending_review: "Aguardando revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  failed: "Falhou",
};

/** Signal names used in `weights`/`Clip.signals` (see app/presets.py). */
export const SIGNAL_NAMES = ["audio", "scenes", "motion", "speech", "llm"] as const;
export type SignalName = (typeof SIGNAL_NAMES)[number];

export const SIGNAL_LABELS: Record<SignalName, string> = {
  audio: "Áudio",
  scenes: "Cenas",
  motion: "Movimento",
  speech: "Fala",
  llm: "LLM",
};

/** Mirrors app/schemas/clip.py::ClipRead. */
export type Clip = {
  id: string;
  job_id: string;
  media_asset_id: string;
  channel_id: string | null;
  start_s: number;
  end_s: number;
  score: number | null;
  signals: Record<string, number> | null;
  storage_key: string | null;
  thumbnail_key: string | null;
  subtitles_key: string | null;
  transcript: string | null;
  status: ClipStatus;
  created_at: string;
};

/** Mirrors app/schemas/clip_metadata.py::ClipMetadataRead. */
export type ClipMetadata = {
  id: string;
  clip_id: string;
  platform: PlatformValue;
  title: string | null;
  description: string | null;
  hashtags: string[];
  edited: boolean;
};

export type ClipMetadataInput = {
  title?: string | null;
  description?: string | null;
  hashtags?: string[] | null;
};

/** Mirrors app/schemas/clip.py::ClipDetailRead. */
export type ClipDetail = Clip & { metadata: ClipMetadata[] };

export type ClipsFilters = {
  status?: ClipStatus;
  job_id?: string;
  media_asset_id?: string;
  channel_id?: string;
  limit?: number;
  offset?: number;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listClips(filters: ClipsFilters = {}, signal?: AbortSignal): Promise<Clip[]> {
  return api.get<Clip[]>(`/api/clips${buildQuery(filters)}`, { signal });
}

export function getClip(id: string, signal?: AbortSignal): Promise<ClipDetail> {
  return api.get<ClipDetail>(`/api/clips/${id}`, { signal });
}

export type ClipUpdateInput = {
  status?: "approved" | "rejected";
  start_s?: number;
  end_s?: number;
};

export function updateClip(id: string, payload: ClipUpdateInput): Promise<Clip> {
  return api.patch<Clip>(`/api/clips/${id}`, payload);
}

export function bulkUpdateClips(ids: string[], action: "approve" | "reject"): Promise<Clip[]> {
  return api.post<Clip[]>("/api/clips/bulk", { ids, action });
}

export function upsertClipMetadata(
  clipId: string,
  platform: PlatformValue,
  payload: ClipMetadataInput,
): Promise<ClipMetadata> {
  return api.put<ClipMetadata>(`/api/clips/${clipId}/metadata/${platform}`, payload);
}

export function regenerateClipMetadata(
  clipId: string,
  platform?: PlatformValue,
): Promise<{ task_id: string; status: string }> {
  const qs = platform ? `?platform=${platform}` : "";
  return api.post<{ task_id: string; status: string }>(`/api/clips/${clipId}/metadata/regenerate${qs}`, undefined);
}

export function clipVideoUrl(id: string): string {
  return `${API_URL}/api/clips/${id}/video`;
}

export function clipThumbnailUrl(id: string): string {
  return `${API_URL}/api/clips/${id}/thumbnail`;
}
