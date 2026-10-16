"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

type Status = "checking" | "online" | "offline";

const STATUS_CONFIG: Record<Status, { label: string; dotClass: string }> = {
  checking: { label: "Verificando API…", dotClass: "bg-amber-400" },
  online: { label: "API online", dotClass: "bg-emerald-500" },
  offline: { label: "API indisponível", dotClass: "bg-red-500" },
};

/** 8px status dot (next to the logo). The text is available to screen readers and as a tooltip. */
export function StatusIndicator() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function checkHealth() {
      try {
        await getHealth(controller.signal);
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    checkHealth();
    const interval = window.setInterval(checkHealth, 30_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const { label, dotClass } = STATUS_CONFIG[status];

  return (
    <span role="status" title={label} className="inline-flex items-center">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
