import { api } from "@/lib/api";
import type { PlatformValue, TemplateParams } from "@/lib/channels";

/** Mirrors app/models/platform_account.py::AccountMode/AccountStatus. */
export type AccountMode = "oauth" | "manual";
export type AccountStatus = "connected" | "expired" | "error" | "manual";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  connected: "Conectada",
  expired: "Expirada",
  error: "Erro",
  manual: "Manual",
};

/** `posting_windows` item shape (`app/scheduling.py`). Days: 0=segunda. */
export type PostingWindow = {
  days: number[];
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

/** Mirrors app/schemas/platform_account.py::PlatformAccountRead. */
export type PlatformAccount = {
  id: string;
  channel_id: string | null;
  platform: PlatformValue;
  display_name: string;
  mode: AccountMode;
  external_id: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  status: AccountStatus;
  daily_limit: number | null;
  posting_windows: PostingWindow[];
  timezone: string;
  template: TemplateParams | null;
  monetized: boolean;
  created_at: string;
};

/** Mirrors app/schemas/platform_account.py::PlatformInfo. */
export type PlatformInfo = {
  id: PlatformValue;
  name: string;
  supports_oauth: boolean;
  configured: boolean;
  notes: string;
};

export type PlatformAccountCreateInput = {
  platform: PlatformValue;
  display_name: string;
  channel_id?: string | null;
};

export type PlatformAccountUpdateInput = {
  display_name?: string;
  channel_id?: string | null;
  daily_limit?: number | null;
  posting_windows?: PostingWindow[];
  timezone?: string;
  template?: TemplateParams | null;
  monetized?: boolean;
};

export function listPlatforms(signal?: AbortSignal): Promise<PlatformInfo[]> {
  return api.get<PlatformInfo[]>("/api/platforms", { signal });
}

export function listAccounts(channelId?: string, signal?: AbortSignal): Promise<PlatformAccount[]> {
  const qs = channelId ? `?channel_id=${channelId}` : "";
  return api.get<PlatformAccount[]>(`/api/accounts${qs}`, { signal });
}

export function createAccount(payload: PlatformAccountCreateInput): Promise<PlatformAccount> {
  return api.post<PlatformAccount>("/api/accounts", payload);
}

export function updateAccount(id: string, payload: PlatformAccountUpdateInput): Promise<PlatformAccount> {
  return api.patch<PlatformAccount>(`/api/accounts/${id}`, payload);
}

export function deleteAccount(id: string): Promise<void> {
  return api.delete<void>(`/api/accounts/${id}`);
}

/** 501 today ("OAuth connect for <platform> not implemented yet") — surfaced
 * as a friendly message by the caller rather than a raw error. */
export function connectAccount(platform: PlatformValue): Promise<{ authorize_url: string }> {
  return api.get<{ authorize_url: string }>(`/api/accounts/${platform}/connect`);
}

export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
