import { API_URL, ApiError, api, getAsUserId, withAsUserParam } from "@/lib/api";
import type { Privacy, Publication } from "@/lib/publications";

/* ------------------------------------------------------------------ enums */

/** Mirrors docs/series-ia-plano.md §3 (state machines). */
export type SeriesStatus = "planning" | "planned" | "plan_failed" | "active" | "paused" | "completed" | "canceled";

export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  planning: "Planejando…",
  planned: "Plano pronto",
  plan_failed: "Falha no plano",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  canceled: "Cancelada",
};

export const SERIES_STATUSES = Object.keys(SERIES_STATUS_LABELS) as SeriesStatus[];

export type PauseReason =
  | "user"
  | "series_budget_exceeded"
  | "user_ai_budget_exceeded"
  | "storage_quota_exceeded"
  | "provider_unavailable";

export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  user: "Pausada por você",
  series_budget_exceeded: "Orçamento da série estourado",
  user_ai_budget_exceeded: "Orçamento mensal de IA estourado",
  storage_quota_exceeded: "Cota de armazenamento cheia",
  provider_unavailable: "Provedor indisponível",
};

export const PAUSE_REASON_HINTS: Record<PauseReason, string> = {
  user: "Retome a série quando quiser continuar.",
  series_budget_exceeded: "Aumente o orçamento em Configuração e retome.",
  user_ai_budget_exceeded: "Fale com o administrador ou aguarde o próximo mês e retome.",
  storage_quota_exceeded: "Libere espaço (apague cortes/vídeos antigos) ou peça mais cota ao administrador e retome.",
  provider_unavailable: "Confira as chaves em Contas ou troque o provedor em Configuração e retome.",
};

export type EpisodeStatus =
  | "planned"
  | "scripting"
  | "validating"
  | "script_ready"
  | "awaiting_script_approval"
  | "generating_media"
  | "assembling"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "needs_attention"
  | "stale"
  | "canceled";

export const EPISODE_STATUS_LABELS: Record<EpisodeStatus, string> = {
  planned: "Planejado",
  scripting: "Escrevendo roteiro…",
  validating: "Validando roteiro…",
  script_ready: "Roteiro pronto",
  awaiting_script_approval: "Aprovar roteiro",
  generating_media: "Gerando mídia…",
  assembling: "Montando vídeo…",
  pending_review: "Aprovar vídeo",
  approved: "Aprovado (sem horário)",
  scheduled: "Agendado",
  published: "Publicado",
  rejected: "Rejeitado",
  needs_attention: "Precisa de atenção",
  stale: "Desatualizado",
  canceled: "Cancelado",
};

/** Statuses that advance on their own (drive polling — spec §9). */
export const EPISODE_TRANSIENT_STATUSES: EpisodeStatus[] = [
  "scripting",
  "validating",
  "script_ready",
  "generating_media",
  "assembling",
];

/** Statuses that need a human action (spec §2 "atenção do usuário"). */
export const EPISODE_ATTENTION_STATUSES: EpisodeStatus[] = [
  "needs_attention",
  "awaiting_script_approval",
  "pending_review",
  "stale",
  "rejected",
];

/** Priority used by "Próximo passo para você" (spec §5.1). */
export const EPISODE_ATTENTION_PRIORITY: EpisodeStatus[] = [
  "needs_attention",
  "awaiting_script_approval",
  "pending_review",
  "stale",
];

export type ArcPhase = "setup" | "rising" | "midpoint" | "escalation" | "climax" | "resolution";

export const ARC_PHASE_LABELS: Record<ArcPhase, string> = {
  setup: "Apresentação",
  rising: "Tensão crescente",
  midpoint: "Virada",
  escalation: "Escalada",
  climax: "Clímax",
  resolution: "Desfecho",
};

export type CharacterStatus = "alive" | "injured" | "missing" | "transformed" | "dead";

export const CHARACTER_STATUS_LABELS: Record<CharacterStatus, string> = {
  alive: "Vivo",
  injured: "Ferido",
  missing: "Desaparecido",
  transformed: "Transformado",
  dead: "Morto",
};

export const CHARACTER_STATUS_SYMBOLS: Record<CharacterStatus, string> = {
  alive: "●",
  injured: "✚",
  missing: "?",
  transformed: "✦",
  dead: "✝",
};

export type CharacterRole = "protagonist" | "antagonist" | "supporting" | "minor";

export const CHARACTER_ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: "Protagonista",
  antagonist: "Antagonista",
  supporting: "Coadjuvante",
  minor: "Figurante",
};

export type MediaJobStatus = "queued" | "submitted" | "running" | "succeeded" | "failed" | "canceled";

export const MEDIA_JOB_STATUS_LABELS: Record<MediaJobStatus, string> = {
  queued: "Na fila",
  submitted: "Enviado",
  running: "Gerando",
  succeeded: "Pronto",
  failed: "Falhou",
  canceled: "Cancelado",
};

export type MediaJobKind = "video_clip" | "image" | "tts";

export const MEDIA_JOB_KIND_LABELS: Record<MediaJobKind, string> = {
  video_clip: "Vídeo",
  image: "Imagem",
  tts: "Voz",
};

export type VisualStrategy = "economy" | "hybrid" | "full_video";
export type VisualMode = "video" | "image";
export type RegenerateScope = "script" | "media" | "narration";

export const EPISODE_COUNT = 20;
export const MIN_PREMISE_LENGTH = 50;
export const MAX_PREMISE_LENGTH = 4000;

/* -------------------------------------------------------------- providers */

export type ProviderKind = "video" | "image" | "tts";
export type CostUnit = "per_second" | "per_image" | "per_1k_chars";

export type Provider = {
  id: string;
  name: string;
  configured: boolean;
  fake: boolean;
  supports_reference_images: boolean;
  max_reference_images: number;
  allowed_durations?: number[] | null;
  word_timestamps?: boolean | null;
  est_cost_usd: number | null;
  est_cost_unit: CostUnit;
};

export type ProvidersResponse = { video: Provider[]; image: Provider[]; tts: Provider[] };

export type Voice = { id: string; name: string; gender: string | null; preview_url: string | null };

export type EstimateInput = {
  visual_strategy: VisualStrategy;
  max_video_scenes_per_episode: number;
  video_provider?: string | null;
  image_provider?: string | null;
  tts_provider?: string | null;
};

export type CostBreakdown = { video: number; image: number; tts: number; llm: number };

export type EstimateResponse = {
  per_episode_usd: number;
  season_usd: number;
  breakdown: CostBreakdown;
  assumptions: string[];
};

export function getProviders(signal?: AbortSignal): Promise<ProvidersResponse> {
  return api.get<ProvidersResponse>("/api/series/providers", { signal });
}

export function listVoices(ttsId: string, language = "pt-BR", signal?: AbortSignal): Promise<Voice[]> {
  return api.get<Voice[]>(
    `/api/series/providers/tts/${encodeURIComponent(ttsId)}/voices?language=${encodeURIComponent(language)}`,
    { signal },
  );
}

export function estimateCost(payload: EstimateInput, signal?: AbortSignal): Promise<EstimateResponse> {
  return api.post<EstimateResponse>("/api/series/estimate", payload, { signal });
}

/* ----------------------------------------------------------------- series */

export type SeriesProgress = {
  approved: number;
  scheduled: number;
  published: number;
  pending_review: number;
  awaiting_script_approval: number;
  failed: number;
};

export type NextEpisode = { number: number; target_date: string | null; status: EpisodeStatus; title?: string | null };

export type Series = {
  id: string;
  owner_id: string;
  channel_id: string | null;
  title: string;
  premise: string;
  genre: string | null;
  tone: string | null;
  status: SeriesStatus;
  pause_reason: PauseReason | null;
  error: string | null;
  visual_strategy: VisualStrategy;
  max_video_scenes_per_episode: number;
  video_provider: string | null;
  image_provider: string | null;
  tts_provider: string | null;
  tts_voice_id: string | null;
  publish_time: string;
  timezone: string;
  lead_days: number;
  privacy: Privacy;
  budget_limit_usd: number | null;
  max_regenerations_per_episode: number;
  require_script_approval: boolean;
  monetization_allowed: boolean;
  bible_version: number;
  start_date?: string | null;
  /** Total spent so far; the contract lists no field for it on SeriesRead, so we accept any of these. */
  total_cost_usd?: number | null;
  spent_usd?: number | null;
  cost_usd?: number | null;
  created_at: string;
  progress: SeriesProgress;
  next_episode: NextEpisode | null;
  estimated_cost: { per_episode_usd: number; season_usd: number } | null;
};

/** Cost spent so far, tolerating the (unspecified) field name. */
export function seriesSpent(series: Pick<Series, "total_cost_usd" | "spent_usd" | "cost_usd">): number | null {
  return series.total_cost_usd ?? series.spent_usd ?? series.cost_usd ?? null;
}

/* ------------------------------------------------------------------ bible */

export type BibleLocation = { key: string; name: string; visual_description: string };

export type Bible = {
  world: { setting: string; era: string; rules: string[]; locations: BibleLocation[] };
  style_guide: { narration_voice: string; visual_style: string; banned_elements: string[] };
  relationships: { a: string; b: string; type: string; description: string }[];
  season_arc: { theme: string; central_question: string; ending_summary: string };
  open_threads: {
    key: string;
    description: string;
    introduced_in: number;
    planned_resolution_in: number | null;
    closed_in: number | null;
  }[];
  premise_core_elements: string[];
};

export type CharacterEventState = "proposed" | "applied" | "discarded";

export type CharacterEvent = {
  id: string;
  episode_number: number;
  type: "introduce" | "status_change";
  from_status: CharacterStatus | null;
  to_status: CharacterStatus | null;
  description: string | null;
  state: CharacterEventState;
  character_key?: string;
};

export type Character = {
  id: string;
  key: string;
  name: string;
  role: CharacterRole;
  description: string;
  visual_description: string;
  personality: string | null;
  status: CharacterStatus;
  committed: boolean;
  introduced_in_episode: number | null;
  has_reference_image: boolean;
  events: CharacterEvent[];
};

export type CharacterUpdateInput = Partial<
  Pick<Character, "name" | "description" | "visual_description" | "role" | "personality">
>;

/* --------------------------------------------------------------- episodes */

export type EpisodeSummary = {
  id: string;
  number: number;
  title: string;
  arc_phase: ArcPhase;
  status: EpisodeStatus;
  target_date: string | null;
  scheduled_at: string | null;
  clip_id: string | null;
  cost_usd: number | null;
  regenerations: number;
  error: string | null;
};

export type EpisodeOutline = {
  summary?: string;
  key_events?: string[];
  planned_state_changes?: { character_key: string; to_status: CharacterStatus; note?: string }[];
  cliffhanger?: string;
  [key: string]: unknown;
};

export type Scene = {
  index: number;
  duration_s: number;
  narration: string;
  visual_prompt: string;
  visual_mode: VisualMode;
  characters_on_screen: string[];
  location_key: string | null;
  camera: string;
  mood: string;
  is_flashback: boolean;
};

export type ScriptStateEvent = {
  type: "introduce" | "status_change";
  character_key: string;
  new_character?: { name: string; role?: CharacterRole; description?: string } | null;
  from_status?: CharacterStatus | null;
  to_status?: CharacterStatus | null;
  description?: string;
};

export type EpisodeScript = {
  number: number;
  title: string;
  on_screen_title: string;
  scenes: Scene[];
  cliffhanger: string;
  state_events: ScriptStateEvent[];
  threads_opened?: { key: string; description: string }[];
  threads_closed?: string[];
  continuity_notes?: string;
};

export type ValidationIssue = {
  code: string;
  severity: "blocker" | "warning";
  scene_index: number | null;
  message: string;
  suggestion: string | null;
};

export type ValidationReport = {
  ok: boolean;
  scores?: Partial<Record<"premise_fidelity" | "coherence" | "interest" | "outline_adherence", number>>;
  issues: ValidationIssue[];
};

export type MediaJob = {
  id: string;
  kind: MediaJobKind;
  scene_index: number | null;
  provider: string;
  status: MediaJobStatus;
  attempts: number;
  duration_s: number | null;
  cost_usd_estimated: number | null;
  cost_usd_actual: number | null;
  error: string | null;
};

export type EpisodeDetail = EpisodeSummary & {
  outline: EpisodeOutline | null;
  script: EpisodeScript | null;
  script_revision: number;
  user_instructions: string | null;
  validation: ValidationReport | null;
  validation_attempts: number;
  media_jobs: MediaJob[];
  state_events: (CharacterEvent & { character_key: string })[];
  publications: (Publication & { synthetic_media?: boolean })[];
};

export type SeriesDetail = Series & {
  bible: Bible | null;
  characters: Character[];
  episodes: EpisodeSummary[];
};

export type CostEvent = {
  id?: string;
  created_at?: string;
  kind: "llm" | "video" | "image" | "tts";
  provider?: string | null;
  model?: string | null;
  episode_number?: number | null;
  cost_usd: number;
};

export type SeriesCosts = {
  total_usd: number;
  budget_limit_usd: number | null;
  by_kind: Partial<Record<"llm" | "video" | "image" | "tts", number>>;
  by_episode: Record<string, number> | { episode_number: number; cost_usd: number }[];
  recent: CostEvent[];
};

/* -------------------------------------------------------------- API calls */

export type SeriesCreateInput = {
  title?: string;
  premise: string;
  genre: string;
  tone: string;
  channel_id: string;
  visual_strategy: VisualStrategy;
  max_video_scenes_per_episode: number;
  video_provider?: string | null;
  image_provider: string;
  tts_provider: string;
  tts_voice_id: string;
  publish_time: string;
  timezone: string;
  lead_days: 1 | 2;
  privacy: Privacy;
  budget_limit_usd?: number | null;
  max_regenerations_per_episode: number;
  require_script_approval: boolean;
  monetization_allowed: boolean;
  originality_attestation: true;
};

export type SeriesUpdateInput = Partial<
  Pick<
    Series,
    | "title"
    | "publish_time"
    | "timezone"
    | "lead_days"
    | "privacy"
    | "budget_limit_usd"
    | "max_regenerations_per_episode"
    | "visual_strategy"
    | "max_video_scenes_per_episode"
    | "video_provider"
    | "image_provider"
    | "tts_provider"
    | "tts_voice_id"
    | "require_script_approval"
    | "monetization_allowed"
  >
>;

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : "";
}

const base = (id: string) => `/api/series/${id}`;

export const seriesApi = {
  list: (filters: { channel_id?: string; status?: string } = {}, signal?: AbortSignal) =>
    api.get<Series[]>(`/api/series${qs(filters)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => api.get<SeriesDetail>(base(id), { signal }),
  create: (payload: SeriesCreateInput) => api.post<Series>("/api/series", payload),
  update: (id: string, payload: SeriesUpdateInput) => api.patch<Series>(base(id), payload),
  remove: (id: string) => api.delete<void>(base(id)),
  putBible: (id: string, bible_version: number, bible: Bible) =>
    api.put<SeriesDetail | Bible>(`${base(id)}/bible`, { bible_version, bible }),
  patchCharacter: (id: string, cid: string, payload: CharacterUpdateInput) =>
    api.patch<Character>(`${base(id)}/characters/${cid}`, payload),
  deleteReferenceImage: (id: string, cid: string) => api.delete<void>(`${base(id)}/characters/${cid}/reference-image`),
  putOutline: (id: string, n: number, outline: EpisodeOutline) =>
    api.put<EpisodeDetail>(`${base(id)}/outline/${n}`, outline),
  replan: (id: string, instructions?: string) => api.post<Series>(`${base(id)}/replan`, { instructions: instructions || undefined }),
  start: (id: string, start_date?: string) => api.post<Series>(`${base(id)}/start`, { start_date: start_date || undefined }),
  pause: (id: string) => api.post<Series>(`${base(id)}/pause`, {}),
  resume: (id: string) => api.post<Series>(`${base(id)}/resume`, {}),
  cancel: (id: string, cancel_scheduled_publications: boolean) =>
    api.post<Series>(`${base(id)}/cancel`, { cancel_scheduled_publications }),
  episode: (id: string, n: number, signal?: AbortSignal) =>
    api.get<EpisodeDetail>(`${base(id)}/episodes/${n}`, { signal }),
  putScript: (id: string, n: number, script_revision: number, script: EpisodeScript) =>
    api.put<EpisodeDetail>(`${base(id)}/episodes/${n}/script`, { script_revision, script }),
  regenerate: (id: string, n: number, scope: RegenerateScope, instructions?: string) =>
    api.post<unknown>(`${base(id)}/episodes/${n}/regenerate`, { scope, instructions: instructions || undefined }),
  approveScript: (id: string, n: number) => api.post<EpisodeDetail>(`${base(id)}/episodes/${n}/approve-script`, {}),
  approve: (id: string, n: number) => api.post<EpisodeDetail>(`${base(id)}/episodes/${n}/approve`, {}),
  reject: (id: string, n: number, body: { instructions?: string; regenerate: boolean; scope?: RegenerateScope }) =>
    api.post<EpisodeDetail>(`${base(id)}/episodes/${n}/reject`, body),
  unapprove: (id: string, n: number) => api.post<EpisodeDetail>(`${base(id)}/episodes/${n}/unapprove`, {}),
  costs: (id: string, signal?: AbortSignal) => api.get<SeriesCosts>(`${base(id)}/costs`, { signal }),
};

export function referenceImageUrl(seriesId: string, characterId: string, version?: string | number): string {
  const url = withAsUserParam(`${API_URL}${base(seriesId)}/characters/${characterId}/reference-image`);
  return version !== undefined ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url;
}

/** Multipart upload (png/jpeg/webp, <= 5 MB). Does not go through `api.*`: that forces a JSON Content-Type. */
export async function uploadReferenceImage(
  seriesId: string,
  characterId: string,
  file: File,
): Promise<{ has_reference_image?: boolean }> {
  const form = new FormData();
  form.append("file", file);
  const asUser = getAsUserId();
  const res = await fetch(`${API_URL}${base(seriesId)}/characters/${characterId}/reference-image`, {
    method: "PUT",
    body: form,
    credentials: "include",
    headers: asUser ? { "X-As-User": asUser } : undefined,
  });
  if (!res.ok) {
    let detail;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* no body */
    }
    throw new ApiError(`Request failed: ${res.status}`, res.status, detail);
  }
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------- helpers */

export function isEpisodeTransient(status: EpisodeStatus): boolean {
  return EPISODE_TRANSIENT_STATUSES.includes(status);
}

export function episodeNeedsAttention(status: EpisodeStatus): boolean {
  return EPISODE_ATTENTION_STATUSES.includes(status);
}

/** Series needing a human (spec §3 "séries com atenção primeiro"). */
export function seriesAttentionCount(series: Series): number {
  return series.progress.failed + series.progress.pending_review + series.progress.awaiting_script_approval;
}

/** Plain-text label for an episode status that also names the next action. */
export function nextActionText(status: EpisodeStatus, number: number): string {
  switch (status) {
    case "awaiting_script_approval":
      return `Aprovar roteiro do Ep. ${number}`;
    case "pending_review":
      return `Aprovar vídeo do Ep. ${number}`;
    case "needs_attention":
      return `Ep. ${number} precisa de atenção`;
    case "stale":
      return `Ep. ${number} está desatualizado`;
    default:
      return `Ep. ${number}: ${EPISODE_STATUS_LABELS[status]}`;
  }
}

export const VALIDATION_CODE_LABELS: Record<string, string> = {
  premise_drift: "Fuga da premissa",
  outline_deviation: "Fuga da sinopse",
  dead_character_appears: "Personagem morto em cena",
  status_contradiction: "Contradição de status",
  unresolved_reference: "Referência não resolvida",
  ip_infringement: "Possível cópia de obra protegida",
  real_person: "Pessoa real",
  unsafe_content: "Conteúdo inadequado",
  weak_hook: "Gancho fraco",
  pacing_overload: "Ritmo sobrecarregado",
};

export const PREMISE_REJECTION_LABELS: Record<string, string> = {
  ip_infringement: "Parece copiar uma obra, personagem ou universo protegido",
  real_person: "Envolve uma pessoa real",
  unsafe: "Conteúdo não permitido",
  too_vague: "Premissa vaga demais; detalhe conflito e personagens",
};

export const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Bahia",
  "America/Fortaleza",
  "America/New_York",
  "Europe/Lisbon",
  "UTC",
];

export const PRIVACY_OPTIONS: { value: Privacy; label: string }[] = [
  { value: "public", label: "Pública" },
  { value: "private", label: "Privada" },
  { value: "self_only", label: "Só eu" },
];

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Normalizes `costs.by_episode` (object keyed by number or list) into a sorted list. */
export function costsByEpisode(costs: SeriesCosts): { episode_number: number; cost_usd: number }[] {
  const raw = costs.by_episode;
  const list = Array.isArray(raw)
    ? raw
    : Object.entries(raw ?? {}).map(([k, v]) => ({ episode_number: Number(k), cost_usd: Number(v) }));
  return [...list].sort((a, b) => a.episode_number - b.episode_number);
}
