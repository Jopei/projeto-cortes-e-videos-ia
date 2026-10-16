import { api } from "@/lib/api";

/** Mirrors app/schemas/user.py::UserRead (services/api). */
export type UserRead = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  must_change_password: boolean;
  storage_quota_bytes: number | null;
  daily_analysis_quota: number | null;
  max_channels: number | null;
  max_active_series?: number | null;
  monthly_ai_budget_usd?: number | null;
  created_at: string;
  last_login_at: string | null;
};

export type LoginInput = {
  username: string;
  password: string;
};

export function login(payload: LoginInput): Promise<UserRead> {
  return api.post<UserRead>("/api/auth/login", payload);
}

export function logout(): Promise<void> {
  return api.post<void>("/api/auth/logout", undefined);
}

export function getCurrentUser(signal?: AbortSignal): Promise<UserRead> {
  return api.get<UserRead>("/api/auth/me", { signal });
}

export type ChangePasswordInput = {
  current_password: string;
  new_password: string;
};

/** Mirrors app/schemas/user.py::MIN_PASSWORD_LENGTH. */
export const MIN_PASSWORD_LENGTH = 10;

export function changePassword(payload: ChangePasswordInput): Promise<void> {
  return api.post<void>("/api/auth/change-password", payload);
}

/**
 * Only accept internal, single-segment-rooted paths as a post-login redirect
 * target (blocks protocol-relative URLs like "//evil.com" and absolute URLs).
 */
export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  if (next.includes("\\")) return null;
  return next;
}
