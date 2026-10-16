"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useChannelContext } from "@/lib/channel-context";
import { useAuth } from "@/lib/user-context";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard";

const POLL_MS = 45_000;

type NavCountsValue = { summary: DashboardSummary | null; refresh: () => void };
const NavCountsContext = createContext<NavCountsValue>({ summary: null, refresh: () => {} });

/** One shared poll of GET /api/dashboard/summary for the sidebar badges (and
 * the dashboard's attention strip). Pauses while the tab is hidden. */
export function NavCountsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { selectedChannelId } = useChannelContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    try {
      const data = await getDashboardSummary(selectedChannelId || undefined, c.signal);
      if (!c.signal.aborted) setSummary(data);
    } catch {
      /* best-effort: keep last known counts */
    }
  }, [selectedChannelId]);

  useEffect(() => {
    if (!user) return;
    void load();
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => {
      window.clearInterval(t);
      ctrl.current?.abort();
    };
  }, [user, load]);

  const value = useMemo(() => ({ summary, refresh: () => void load() }), [summary, load]);
  return <NavCountsContext.Provider value={value}>{children}</NavCountsContext.Provider>;
}

export function useNavCounts(): NavCountsValue {
  return useContext(NavCountsContext);
}
