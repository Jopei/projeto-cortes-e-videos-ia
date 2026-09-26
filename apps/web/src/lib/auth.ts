import { api } from "@/lib/api";

/** Mirrors app/schemas/user.py::UserRead (services/api). */
export type UserRead = {
  id: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
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
