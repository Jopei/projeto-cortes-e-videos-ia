"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAsUserId, setAsUserId as persistAsUserId } from "@/lib/api";
import { displayNameOf, listAdminUsers, type AdminUserRead } from "@/lib/admin-users";
import { useAuth } from "@/lib/user-context";

type AdminViewContextValue = {
  /** All users, only ever populated for an admin (empty otherwise). Used to
   * both feed the "ver como" selector and resolve owner_id -> username in
   * the "todos" view of every list screen (see `useOwnerLabel`). */
  users: AdminUserRead[];
  loadingUsers: boolean;
  /** `null` = "todos os usuários" (no impersonation). */
  asUserId: string | null;
  asUser: AdminUserRead | null;
  setAsUserId: (id: string | null) => void;
  reloadUsers: () => void;
};

const AdminViewContext = createContext<AdminViewContextValue | null>(null);

/**
 * Admin-only "ver como outro usuário" state. Persisted to localStorage by
 * `lib/api.ts` (`setAsUserId`), which is also what attaches the
 * `X-As-User` header to every request — this provider only owns the UI
 * state (selector value, banner, user list) and keeps it in sync with a
 * non-admin session (e.g. an admin demoting themselves) by clearing it.
 */
export function AdminViewProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [asUserId, setAsUserIdState] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRead[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    setAsUserIdState(getAsUserId());
  }, []);

  const loadUsers = useCallback(
    async (signal?: AbortSignal) => {
      if (!user?.is_admin) return;
      setLoadingUsers(true);
      try {
        const data = await listAdminUsers(signal);
        setUsers(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // best-effort: the selector just stays empty on a transient error
      } finally {
        setLoadingUsers(false);
      }
    },
    [user?.is_admin],
  );

  useEffect(() => {
    if (!user?.is_admin) return;
    const controller = new AbortController();
    loadUsers(controller.signal);
    return () => controller.abort();
  }, [user?.is_admin, loadUsers]);

  const setAsUserId = useCallback((id: string | null) => {
    persistAsUserId(id);
    setAsUserIdState(id);
  }, []);

  // A non-admin (or an admin who just lost admin rights) never keeps an
  // active impersonation filter lingering in localStorage.
  useEffect(() => {
    if (user && !user.is_admin && asUserId) {
      setAsUserId(null);
    }
  }, [user, asUserId, setAsUserId]);

  const asUser = useMemo(() => users.find((u) => u.id === asUserId) ?? null, [users, asUserId]);

  const value = useMemo<AdminViewContextValue>(
    () => ({ users, loadingUsers, asUserId, asUser, setAsUserId, reloadUsers: () => loadUsers() }),
    [users, loadingUsers, asUserId, asUser, setAsUserId, loadUsers],
  );

  return <AdminViewContext.Provider value={value}>{children}</AdminViewContext.Provider>;
}

export function useAdminView(): AdminViewContextValue {
  const ctx = useContext(AdminViewContext);
  if (!ctx) throw new Error("useAdminView must be used within AdminViewProvider");
  return ctx;
}

/** True only when an admin is looking at the unfiltered "todos os usuários"
 * view — that's the one case where owned rows can belong to more than one
 * person, so list screens should show a "Dono" column. */
export function useShowOwnerColumn(): boolean {
  const { user } = useAuth();
  const { asUserId } = useAdminView();
  return Boolean(user?.is_admin) && !asUserId;
}

/** Resolves an `owner_id` (or audit-log `user_id`) to a display label.
 * Falls back to a short id fragment when the user list hasn't loaded yet or
 * the id is unknown (e.g. a since-deleted user, or `null`/automated rows). */
export function useOwnerLabel(): (ownerId: string | null) => string {
  const { users } = useAdminView();
  return useCallback(
    (ownerId: string | null) => {
      if (!ownerId) return "sistema";
      const match = users.find((u) => u.id === ownerId);
      return match ? displayNameOf(match) : `${ownerId.slice(0, 8)}…`;
    },
    [users],
  );
}
