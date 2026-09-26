"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, type UserRead } from "@/lib/auth";

type AuthContextValue = {
  user: UserRead | null;
  loading: boolean;
  /** Re-fetches `/api/auth/me` — call after login/logout/password change or
   * any admin edit of the current user's own quotas. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Every route under here is exempt from the forced password-change
 * redirect (the change-password form itself, obviously). */
const FORCE_PASSWORD_CHANGE_PATH = "/conta";

/**
 * App-wide auth/user context (`GET /api/auth/me`). Mirrors the fetch
 * `ChannelProvider` already does: skipped on `/login` (no cookie yet, and a
 * 401 there would otherwise trigger `lib/api.ts`'s redirect-to-login on the
 * page that IS the login page), re-fetched on every route change so it
 * picks up a fresh session right after `LoginForm`'s client-side redirect.
 *
 * Also owns the "forçar troca de senha" gate: `middleware.ts` only checks
 * for a session cookie (it never decodes the JWT), so `must_change_password`
 * can only be enforced here, client-side, once we have the user object.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getCurrentUser(signal);
      setUser(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname === "/login") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, pathname]);

  useEffect(() => {
    if (!user?.must_change_password) return;
    if (pathname.startsWith(FORCE_PASSWORD_CHANGE_PATH)) return;
    router.replace("/conta?forcar-troca=1");
  }, [user, pathname, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, refresh: () => load() }),
    [user, loading, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
