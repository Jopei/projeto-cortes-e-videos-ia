import { api } from "@/lib/api";

/** Mirrors app/models/analysis_job.py::Preset. */
export const PRESETS = ["action", "drama", "comedy", "suspense", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  action: "Ação",
  drama: "Drama",
  comedy: "Comédia",
  suspense: "Suspense",
  custom: "Personalizado",
};

/** Mirrors app/models/analysis_job.py::AnalysisJobStatus. */
export type AnalysisJobStatus = "queued" | "running" | "done" | "failed" | "canceled";

export const JOB_STATUS_LABELS: Record<AnalysisJobStatus, string> = {
  queued: "Na fila",
  running: "Processando",
  done: "Concluído",
  failed: "Falhou",
  canceled: "Cancelado",
};

/** Mirrors app/schemas/analysis_job.py::AnalysisJobRead. */
export type AnalysisJob = {
  id: string;
  owner_id: string;
  media_asset_id: string;
  channel_id: string | null;
  status: AnalysisJobStatus;
  progress: number;
  stage: string | null;
  preset: Preset;
  params: Record<string, unknown>;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/** Mirrors app/schemas/analysis_job.py::PresetWeights (GET /api/presets). */
export type PresetWeights = {
  preset: Preset;
  weights: Record<string, number>;
};

export type JobsFilters = {
  status?: AnalysisJobStatus;
  media_asset_id?: string;
  channel_id?: string;
};

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listJobs(filters: JobsFilters = {}, signal?: AbortSignal): Promise<AnalysisJob[]> {
  return api.get<AnalysisJob[]>(`/api/jobs${buildQuery(filters)}`, { signal });
}

export function getJob(id: string, signal?: AbortSignal): Promise<AnalysisJob> {
  return api.get<AnalysisJob>(`/api/jobs/${id}`, { signal });
}

export function cancelJob(id: string): Promise<AnalysisJob> {
  return api.post<AnalysisJob>(`/api/jobs/${id}/cancel`, undefined);
}

export function listPresets(signal?: AbortSignal): Promise<PresetWeights[]> {
  return api.get<PresetWeights[]>("/api/presets", { signal });
}

export const JOB_ACTIVE_STATUSES: AnalysisJobStatus[] = ["queued", "running"];
