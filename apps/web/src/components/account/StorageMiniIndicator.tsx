"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyUsage, usageRatio, type UsageRead } from "@/lib/me";
import { formatBytes } from "@/lib/tus";

/** Small "armazenamento usado" bar shown in the sidebar for regular (non-admin)
 * users — admins are exempt from quotas so it's hidden for them entirely
 * (see components/Sidebar.tsx). Links to the full breakdown on /conta. */
export function StorageMiniIndicator() {
  const [usage, setUsage] = useState<UsageRead | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMyUsage(controller.signal)
      .then(setUsage)
      .catch(() => {
        // best-effort widget: no indicator at all on failure
      });
    return () => controller.abort();
  }, []);

  if (!usage) return null;

  const ratio = usageRatio(usage.storage_used_bytes, usage.storage_quota_bytes);

  return (
    <Link
      href="/conta"
      className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted hover:bg-surface-2"
    >
      <span className="flex items-center justify-between">
        <span>Armazenamento</span>
        <span>
          {formatBytes(usage.storage_used_bytes)}
          {usage.storage_quota_bytes !== null ? ` / ${formatBytes(usage.storage_quota_bytes)}` : ""}
        </span>
      </span>
      {ratio !== null ? (
        <span
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Armazenamento usado"
          className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        >
          <span
            className={`block h-full rounded-full ${ratio >= 0.9 ? "bg-red-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
      ) : null}
    </Link>
  );
}
