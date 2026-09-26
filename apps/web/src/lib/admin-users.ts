import { api } from "@/lib/api";
import type { UserRead } from "@/lib/auth";
import type { UsageRead } from "@/lib/me";

/** Mirrors app/schemas/user.py::AdminUserRead — `GET/POST /api/admin/users`. */
export type AdminUserRead = UserRead & {
  usage: UsageRead;
  clips_count: number;
  publications_count: number;
};

/** Mirrors app/schemas/user.py::AdminUserCreate. Quota fields omitted =
 * backend default (`Settings.default_*`); `undefined` here must NOT be sent
 * as `null` (that would mean "unlimited") — see `buildCreatePayload`. */
export type AdminUserCreateInput = {
  username: string;
  password: string;
  display_name?: string | null;
  email?: string | null;
  is_admin?: boolean;
  storage_quota_gb?: number | null;
  daily_analysis_quota?: number | null;
  max_channels?: number | null;
  must_change_password?: boolean;
};

/** Mirrors app/schemas/user.py::AdminUserUpdate. */
export type AdminUserUpdateInput = {
  display_name?: string | null;
  email?: string | null;
  is_admin?: boolean;
  is_active?: boolean;
  storage_quota_gb?: number | null;
  daily_analysis_quota?: number | null;
  max_channels?: number | null;
};

export function listAdminUsers(signal?: AbortSignal): Promise<AdminUserRead[]> {
  return api.get<AdminUserRead[]>("/api/admin/users", { signal });
}

export function createAdminUser(payload: AdminUserCreateInput): Promise<AdminUserRead> {
  return api.post<AdminUserRead>("/api/admin/users", payload);
}

export function updateAdminUser(id: string, payload: AdminUserUpdateInput): Promise<AdminUserRead> {
  return api.patch<AdminUserRead>(`/api/admin/users/${id}`, payload);
}

export function resetAdminUserPassword(id: string, newPassword: string): Promise<void> {
  return api.post<void>(`/api/admin/users/${id}/reset-password`, { new_password: newPassword });
}

/** 204 either way — the backend deactivates instead of deleting when the
 * user still owns data (see CLAUDE.md "Multiusuário" / `_has_any_data`). */
export function deleteAdminUser(id: string): Promise<void> {
  return api.delete<void>(`/api/admin/users/${id}`);
}

export function displayNameOf(user: Pick<UserRead, "username" | "display_name">): string {
  return user.display_name?.trim() || user.username;
}
