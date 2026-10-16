"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort, isNotFound, isUnavailable, seriesErrorMessage } from "@/lib/series-errors";

export type ResourceState<T> = {
  data: T | null;
  loading: boolean;
  /** Message when the last load failed (old `data` is kept). */
  error: string | null;
  /** Series routes not deployed yet (404 "Not Found" / 405). */
  unavailable: boolean;
  notFound: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
};

/** Loads `fetcher` on mount and whenever `key` changes; keeps stale data on reload errors. */
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: string,
  options: { enabled?: boolean; errorFallback?: string } = {},
): ResourceState<T> {
  const { enabled = true, errorFallback } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const keyRef = useRef(key);

  const run = useCallback(
    async (initial: boolean) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (initial) setLoading(true);
      try {
        const result = await fetcherRef.current(controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        setUnavailable(false);
        setNotFound(false);
      } catch (err) {
        if (isAbort(err) || controller.signal.aborted) return;
        setUnavailable(isUnavailable(err));
        setNotFound(isNotFound(err));
        setError(seriesErrorMessage(err, errorFallback));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [errorFallback],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (keyRef.current !== key) {
      keyRef.current = key;
      setData(null);
    }
    void run(true);
    return () => controllerRef.current?.abort();
  }, [key, enabled, run]);

  const reload = useCallback(() => run(false), [run]);
  return { data, loading, error, unavailable, notFound, reload, setData };
}
