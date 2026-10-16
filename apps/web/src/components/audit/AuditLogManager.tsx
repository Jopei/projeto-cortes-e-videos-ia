"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useOwnerLabel, useShowOwnerColumn } from "@/lib/admin-view";
import { listAuditLog, type AuditLogEntry } from "@/lib/audit-log";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/Skeleton";

const PAGE_SIZE = 50;

export function AuditLogManager() {
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.action} ${e.entity} ${JSON.stringify(e.details ?? {})}`.toLowerCase().includes(q));
  }, [entries, query]);

  const columns: Column<AuditLogEntry>[] = [
    { id: "date", header: "Data", primary: true, cell: (e) => new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) },
    ...(showOwner ? [{ id: "user", header: "Usuário", cell: (e: AuditLogEntry) => ownerLabel(e.user_id) }] : []),
    { id: "action", header: "Ação", cell: (e) => <Badge variant="neutral">{e.action}</Badge> },
    {
      id: "entity",
      header: "Entidade",
      cell: (e) => (
        <>
          {e.entity}
          {e.entity_id ? <span className="font-mono text-xs text-fg-subtle"> #{e.entity_id.slice(0, 8)}</span> : null}
        </>
      ),
    },
    {
      id: "details",
      header: "Detalhes",
      className: "max-w-md",
      cell: (e) =>
        e.details && Object.keys(e.details).length > 0 ? (
          <details className="group">
            <summary className="focus-ring inline-flex min-h-[40px] cursor-pointer md:min-h-[32px] list-none items-center gap-1 rounded text-sm font-medium text-primary-text">
              <Icon name="chevronRight" size={14} className="transition-transform group-open:rotate-90" /> Ver JSON
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-fg-muted">
              {JSON.stringify(e.details, null, 2)}
            </pre>
          </details>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Auditoria"
        description="Histórico de ações relevantes do sistema (jobs, cortes, publicações, contas e canais)."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="audit-search" className="text-sm font-medium text-fg">
          Filtrar nesta página
        </label>
        <input
          id="audit-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ação, entidade ou detalhe"
          className="field-control w-full max-w-xs"
        />
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        <Callout variant="danger" role="alert" title="Não foi possível carregar o log" action={<Button variant="secondary" size="sm" onClick={() => void load(offset)}>Tentar de novo</Button>}>
          {error}
        </Callout>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="history"
          title={entries.length === 0 ? "Nenhum registro de auditoria" : "Nenhum registro com esse filtro"}
          description="Ações relevantes do sistema aparecerão aqui."
          action={entries.length > 0 ? <Button variant="secondary" onClick={() => setQuery("")}>Limpar filtro</Button> : undefined}
        />
      ) : (
        <DataTable caption="Log de auditoria" columns={columns} rows={filtered} rowKey={(e) => e.id} />
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))} disabled={offset === 0}>
          <Icon name="chevronLeft" size={16} /> Anterior
        </Button>
        <span className="text-sm text-fg-muted">Página {Math.floor(offset / PAGE_SIZE) + 1}</span>
        <Button variant="secondary" size="sm" onClick={() => setOffset((prev) => prev + PAGE_SIZE)} disabled={entries.length < PAGE_SIZE}>
          Próxima <Icon name="chevronRight" size={16} />
        </Button>
      </div>
    </div>
  );
}
