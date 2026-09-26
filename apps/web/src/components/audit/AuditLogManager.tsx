"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useOwnerLabel, useShowOwnerColumn } from "@/lib/admin-view";
import { listAuditLog, type AuditLogEntry } from "@/lib/audit-log";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";

const PAGE_SIZE = 50;

export function AuditLogManager() {
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  const load = useCallback(async (currentOffset: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditLog({ limit: PAGE_SIZE, offset: currentOffset }, signal);
      setEntries(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o log de auditoria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(offset, controller.signal);
    return () => controller.abort();
  }, [offset, load]);

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : entries.length === 0 ? (
        <EmptyState title="Nenhum registro de auditoria" description="Ações relevantes do sistema aparecerão aqui." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <caption className="sr-only">Log de auditoria</caption>
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th scope="col" className={thClass}>Data</th>
                {showOwner ? <th scope="col" className={thClass}>Usuário</th> : null}
                <th scope="col" className={thClass}>Ação</th>
                <th scope="col" className={thClass}>Entidade</th>
                <th scope="col" className={thClass}>Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className={tdClass}>{new Date(entry.created_at).toLocaleString("pt-BR")}</td>
                  {showOwner ? <td className={tdClass}>{ownerLabel(entry.user_id)}</td> : null}
                  <td className={tdClass}>{entry.action}</td>
                  <td className={tdClass}>
                    {entry.entity}
                    {entry.entity_id ? <span className="text-xs text-slate-400"> #{entry.entity_id.slice(0, 8)}</span> : null}
                  </td>
                  <td className={`${tdClass} max-w-md`}>
                    {entry.details ? (
                      <code className="block truncate text-xs text-slate-500 dark:text-slate-400" title={JSON.stringify(entry.details)}>
                        {JSON.stringify(entry.details)}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
          disabled={offset === 0}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          ← Anterior
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">Página {Math.floor(offset / PAGE_SIZE) + 1}</span>
        <button
          type="button"
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          disabled={entries.length < PAGE_SIZE}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}

const thClass =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const tdClass = "px-4 py-3 text-slate-800 dark:text-slate-100";
