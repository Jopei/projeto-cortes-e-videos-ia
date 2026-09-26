import { api } from "@/lib/api";
import type { Preset } from "@/lib/jobs";

/** Mirrors app/schemas/template.py::TemplateParams. */
export type TemplateParams = {
  language?: string | null;
  tone?: string | null;
  fixed_hashtags?: string[] | null;
  title_max?: number | null;
  extra_description?: string | null;
};

/** Mirrors app/schemas/analysis_job.py::AnalysisParams. */
export type AnalysisParams = {
  weights?: Record<string, number> | null;
  min_duration?: number | null;
  max_duration?: number | null;
  max_clips?: number | null;
  language?: string | null;
  burn_subtitles?: boolean;
  reframe_mode?: "auto" | "blur" | "center";
};

export const PLATFORM_VALUES = ["youtube", "tiktok", "bilibili", "instagram", "facebook"] as const;
export type PlatformValue = (typeof PLATFORM_VALUES)[number];

export const PLATFORM_LABELS: Record<PlatformValue, string> = {
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  bilibili: "Bilibili",
  instagram: "Instagram Reels",
  facebook: "Facebook Reels",
};

/** Mirrors app/schemas/channel.py::ChannelCounts. */
export type ChannelCounts = {
  accounts_by_platform: Record<string, number>;
  clips_pending_review: number;
  publications_scheduled: number;
  publications_published: number;
};

/** Mirrors app/schemas/channel.py::ChannelWithCounts. */
export type Channel = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  niche: string | null;
  color: string | null;
  default_preset: Preset | null;
  default_params: AnalysisParams | null;
  template: TemplateParams | null;
  is_active: boolean;
  created_at: string;
  counts: ChannelCounts;
};

/** Mirrors app/schemas/channel.py::ChannelBase/ChannelCreate. */
export type ChannelInput = {
  name: string;
  slug: string;
  niche?: string | null;
  color?: string | null;
  default_preset?: Preset | null;
  default_params?: AnalysisParams | null;
  template?: TemplateParams | null;
  is_active?: boolean;
};

export function listChannels(signal?: AbortSignal): Promise<Channel[]> {
  return api.get<Channel[]>("/api/channels", { signal });
}

export function getChannel(id: string, signal?: AbortSignal): Promise<Channel> {
  return api.get<Channel>(`/api/channels/${id}`, { signal });
}

export function createChannel(payload: ChannelInput): Promise<Channel> {
  return api.post<Channel>("/api/channels", payload);
}

export function updateChannel(id: string, payload: Partial<ChannelInput>): Promise<Channel> {
  return api.patch<Channel>(`/api/channels/${id}`, payload);
}

export function deleteChannel(id: string): Promise<void> {
  return api.delete<void>(`/api/channels/${id}`);
}

export const CHANNEL_STORAGE_KEY = "cortes.selected-channel-id";
/** Sentinel used by the global picker to mean "todos os canais" (no filter). */
export const ALL_CHANNELS = "";
