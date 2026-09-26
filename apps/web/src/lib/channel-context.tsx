"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AS_USER_CHANGED_EVENT, ApiError } from "@/lib/api";
import { CHANNEL_STORAGE_KEY, type Channel, listChannels } from "@/lib/channels";

type ChannelContextValue = {
  channels: Channel[];
  loading: boolean;
  error: string | null;
  /** "" means "todos os canais" (no filter). */
  selectedChannelId: string;
  setSelectedChannelId: (id: string) => void;
  selectedChannel: Channel | null;
  reload: () => void;
};

const ChannelContext = createContext<ChannelContextValue | null>(null);

/** Global channel selector state, persisted to localStorage, shared by the
 * Jobs/Revisão/Publicações/Agenda/Upload screens (see CLAUDE.md task: "Um
 * seletor global de canal na sidebar/topo (persistido em localStorage)"). */
export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelIdState] = useState<string>("");

  useEffect(() => {
    const stored = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (stored) setSelectedChannelIdState(stored);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listChannels(signal);
      setChannels(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os canais.");
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

  const setSelectedChannelId = useCallback((id: string) => {
    setSelectedChannelIdState(id);
    window.localStorage.setItem(CHANNEL_STORAGE_KEY, id);
  }, []);

  // Channels are per-user: when an admin switches "ver como" (or goes back
  // to "todos"), the previously selected channel id almost certainly belongs
  // to a different owner (or none) — drop the filter and refetch.
  useEffect(() => {
    function handleAsUserChanged() {
      setSelectedChannelId("");
      load();
    }
    window.addEventListener(AS_USER_CHANGED_EVENT, handleAsUserChanged);
    return () => window.removeEventListener(AS_USER_CHANGED_EVENT, handleAsUserChanged);
  }, [setSelectedChannelId, load]);

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  const value = useMemo<ChannelContextValue>(
    () => ({
      channels,
      loading,
      error,
      selectedChannelId,
      setSelectedChannelId,
      selectedChannel,
      reload: () => load(),
    }),
    [channels, loading, error, selectedChannelId, setSelectedChannelId, selectedChannel, load],
  );

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useChannelContext(): ChannelContextValue {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error("useChannelContext must be used within ChannelProvider");
  return ctx;
}
