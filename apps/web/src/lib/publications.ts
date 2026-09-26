import { API_URL, api, withAsUserParam } from "@/lib/api";
import type { PlatformValue } from "@/lib/channels";

/** Mirrors app/models/publication.py::PublicationStatus/Privacy. */
export type PublicationStatus =
  | "blocked"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled"
  | "taken_down"
  | "exported";

export type Privacy = "private" | "public" | "self_only";

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  blocked: "Bloqueada",
  scheduled: "Agendada",
  publishing: "Publicando",
  published: "Publicada",
  failed: "Falhou",
  canceled: "Cancelada",
  taken_down: "Retirada do ar",
  exported: "Exportada",
};

export const PRIVACY_LABELS: Record<Privacy, string> = {
  private: "Privado",
  public: "Público",
  self_only: "Somente eu",
};

/** Human-readable PT-BR text for the rights-gate `block_reasons` codes
 * (mirrors app/rights/gate.py::check_publishable). */
export const BLOCK_REASON_LABELS: Record<string, string> = {
  clip_not_approved: "O corte ainda não foi aprovado na revisão.",
  missing_license: "Fonte sem licença cadastrada (ou vídeo sem fonte vinculada).",
  outside_validity_window: "Fora da janela de validade da licença.",
  platform_not_allowed: "Esta plataforma não está entre as permitidas pela licença.",
  cc_by_nc_monetization_forbidden:
    "Licença CC BY-NC não permite monetização (conta marcada como monetizada).",
  cc_by_nd_derivative_forbidden:
    "Licença CC BY-ND não permite obras derivadas — cortes são sempre bloqueados.",
  monetization_not_allowed: "A licença não permite monetização (conta marcada como monetizada).",
};

export function blockReasonLabel(reason: string): string {
  return BLOCK_REASON_LABELS[reason] ?? `Bloqueio: ${reason} (trava de direitos autorais).`;
}

/** Mirrors app/schemas/publication.py::PublicationRead. */
export type Publication = {
  id: string;
  owner_id: string;
  clip_id: string;
  account_id: string;
  platform: PlatformValue;
  status: PublicationStatus;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  external_url: string | null;
  privacy: Privacy | null;
  error: string | null;
  block_reasons: string[] | null;
  created_at: string;
};

export type PublicationBatchInput = {
  clip_ids: string[];
  account_ids?: string[];
  target?: "accounts" | "channel";
  schedule?: string; // "auto" | "now" | ISO datetime
  privacy?: Privacy | null;
};

export type PublicationBatchResult = {
  created: Publication[];
};

export type PublicationsFilters = {
  status?: PublicationStatus;
  clip_id?: string;
  account_id?: string;
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

export function createPublicationsBatch(payload: PublicationBatchInput): Promise<PublicationBatchResult> {
  return api.post<PublicationBatchResult>("/api/publications/batch", payload);
}

export function listPublications(
  filters: PublicationsFilters = {},
  signal?: AbortSignal,
): Promise<Publication[]> {
  return api.get<Publication[]>(`/api/publications${buildQuery(filters)}`, { signal });
}

export function cancelPublication(id: string): Promise<Publication> {
  return api.post<Publication>(`/api/publications/${id}/cancel`, undefined);
}

export function takedownPublication(id: string): Promise<Publication> {
  return api.post<Publication>(`/api/publications/${id}/takedown`, undefined);
}

export function publicationExportUrl(id: string): string {
  return withAsUserParam(`${API_URL}/api/publications/${id}/export`);
}
