import type { Privacy } from "@/lib/publications";
import type { VisualStrategy } from "@/lib/series";

export type WizardState = {
  title: string;
  premise: string;
  genre: string;
  genreOther: string;
  tone: string;
  toneOther: string;
  channelId: string;
  strategy: VisualStrategy;
  maxVideoScenes: string;
  imageProvider: string;
  videoProvider: string;
  ttsProvider: string;
  ttsVoiceId: string;
  publishTime: string;
  timezone: string;
  leadDays: 1 | 2;
  privacy: Privacy;
  requireScriptApproval: boolean;
  maxRegens: string;
  budget: string;
  monetization: boolean;
  attested: boolean;
};

export const INITIAL_WIZARD_STATE: WizardState = {
  title: "",
  premise: "",
  genre: "Suspense",
  genreOther: "",
  tone: "sombrio",
  toneOther: "",
  channelId: "",
  strategy: "hybrid",
  maxVideoScenes: "1",
  imageProvider: "",
  videoProvider: "",
  ttsProvider: "",
  ttsVoiceId: "",
  publishTime: "18:00",
  timezone: "America/Sao_Paulo",
  leadDays: 2,
  privacy: "public",
  requireScriptApproval: true,
  maxRegens: "3",
  budget: "",
  monetization: true,
  attested: false,
};

export const GENRES = ["Suspense", "Terror", "Drama", "Ficção científica", "Fantasia", "Romance", "Comédia", "Ação", "Mistério"];
export const TONES = ["sombrio", "leve", "suspense", "dramático", "humor", "esperançoso"];
export const OTHER = "__other__";

export const STEP_TITLES = ["Ideia", "Estilo e custo", "Provedores e voz", "Publicação", "Revisão e atestação"];

export function effectiveGenre(s: WizardState): string {
  return (s.genre === OTHER ? s.genreOther : s.genre).trim();
}
export function effectiveTone(s: WizardState): string {
  return (s.tone === OTHER ? s.toneOther : s.tone).trim();
}

export const ATTESTATION_TEXT =
  "Declaro que a premissa é de minha autoria ou que tenho direito de usá-la, e que não pede para copiar personagens, histórias, marcas ou universos protegidos por direitos autorais, nem retratar pessoas reais. Entendo que o conteúdo é gerado por inteligência artificial, será publicado com o rótulo de conteúdo gerado por IA nas plataformas que oferecem esse recurso, e que sou responsável pelo que for publicado no meu canal.";

export type FieldErrors = Record<string, string>;

/** Step (1-based) each API field belongs to, for routing 422s back to the right step. */
export const FIELD_STEP: Record<string, number> = {
  title: 1,
  premise: 1,
  genre: 1,
  tone: 1,
  channel_id: 1,
  visual_strategy: 2,
  max_video_scenes_per_episode: 2,
  image_provider: 3,
  video_provider: 3,
  tts_provider: 3,
  tts_voice_id: 3,
  publish_time: 4,
  timezone: 4,
  lead_days: 4,
  privacy: 4,
  budget_limit_usd: 4,
  max_regenerations_per_episode: 4,
  require_script_approval: 4,
  monetization_allowed: 4,
  originality_attestation: 5,
};
