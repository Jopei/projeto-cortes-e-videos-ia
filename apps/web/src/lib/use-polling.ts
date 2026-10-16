"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const START_MS = 5000;
const MAX_MS = 20000;
const GIVE_UP_MS = 5 * 60 * 1000;

/**
 * Spec §9. Polls `refresh` only while `active` (a transient state).
 * Interval 5s, +50% up to 20s, reset when `resetKey` changes; stops while
 * the tab is hidden or offline; gives up after 5 min in the same state
 * (`stalled`, with a manual `refetch`). Also revalidates when the tab becomes
 * visible again (and when the connection returns), active or not.
 */
export function usePolling(
  refresh: () => Promise<unknown> | void,
  { active, resetKey }: { active: boolean; resetKey: string },
): { offline: boolean; stalled: boolean; refetch: () => void } {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const [offline, setOffline] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    function onVisible() {
      if (!document.hidden) void refreshRef.current();
    }
    function onOnline() {
      setOffline(false);
      void refreshRef.current();
    }
    function onOffline() {
      setOffline(true);
    }
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setStalled(false);
    if (!active) return;
    let delay = START_MS;
    let timer: number | undefined;
    let cancelled = false;
    const startedAt = Date.now();

    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (Date.now() - startedAt > GIVE_UP_MS) {
          setStalled(true);
          return;
        }
        if (!document.hidden && navigator.onLine !== false) {
          try {
            await refreshRef.current();
          } catch {
            /* surfaced by the owner of `refresh`; keep polling */
          }
          delay = Math.min(MAX_MS, Math.round(delay * 1.5));
        }
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active, resetKey, nonce]);

  const refetch = useCallback(() => {
    void refreshRef.current();
    setNonce((n) => n + 1);
  }, []);

  return { offline, stalled, refetch };
}
