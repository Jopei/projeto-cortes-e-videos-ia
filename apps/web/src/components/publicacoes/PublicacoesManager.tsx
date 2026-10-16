"use client";

import { AiBadge } from "@/components/series/badges";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import { PLATFORM_LABELS, PLATFORM_VALUES, type PlatformValue } from "@/lib/channels";
import {
  PUBLICATION_STATUS_LABELS,
  blockReasonLabel,
  cancelPublication,
  listPublications,
  publicationExportUrl,
  takedownPublication,
  type Publication,
  type PublicationStatus,
} from "@/lib/publications";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { PublicationStatusBadge } from "@/components/ui/StatusBadges";
import { useToast } from "@/components/ui/Toast";

const STATUS_OPTIONS: (PublicationStatus | "")[] = [
  "",
  "blocked",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "canceled",
  "taken_down",
  "exported",
];

export function PublicacoesManager() {
  const { selectedChannelId } = useChannelContext();
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();
  const [statusFilter, setStatusFilter] = useState<PublicationStatus | "">("");
  const [platformFilter, setPlatformFilter] = useState<PlatformValue | "">("");
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [takedownTarget, setTakedownTarget] = useState<Publication | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listPublications(
          {
            channel_id: selectedChannelId || undefined,
            status: statusFilter || undefined,
          },
          signal,
        );
        setPublications(platformFilter ? data.filter((p) => p.platform === platformFilter) : data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar as publicações.");
      } finally {
        setLoading(false);
      }
    },
    [selectedChannelId, statusFilter, platformFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleCancel(pub: Publication) {
    setActioningId(pub.id);
    try {
      await cancelPublication(pub.id);
      showToast("Publicação cancelada.", "success");
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao cancelar publicação.", "error");
    } finally {
      setActioningId(null);
    }
  }

  async function handleTakedown() {
    if (!takedownTarget) return;
    setActioningId(takedownTarget.id);
    try {
      await takedownPublication(takedownTarget.id);
      showToast("Solicitação de retirada do ar enviada.", "success");
      setTakedownTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao retirar do ar.", "error");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="pub-status-filter" className="text-sm font-medium text-fg-muted">
            Status
          </label>
          <select
            id="pub-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PublicationStatus | "")}
            className="field-control"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s ? PUBLICATION_STATUS_LABELS[s] : "Todos"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pub-platform-filter" className="text-sm font-medium text-fg-muted">
            Plataforma
          </label>
          <select
            id="pub-platform-filter"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as PlatformValue | "")}
            className="field-control"
          >
            <option value="">Todas</option>
            {PLATFORM_VALUES.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : publications.length === 0 ? (
        <EmptyState
          icon="send"
          title="Nenhuma publicação encontrada"
          description="Publique cortes aprovados na tela de Revisão para vê-los aqui."
          action={<Button href="/cortes/revisao">Ir para Revisão</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none">
          <table className="min-w-full divide-y divide-border text-sm">
            <caption className="sr-only">Publicações</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={thClass}>Plataforma</th>
                {showOwner ? <th scope="col" className={thClass}>Dono</th> : null}
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Agendado para</th>
                <th scope="col" className={thClass}>Publicado em</th>
                <th scope="col" className={thClass}>Erro / bloqueio</th>
                <th scope="col" className={thClass}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-surface divide-border">
              {publications.map((pub) => (
                <tr key={pub.id}>
                  <td className={tdClass}>{PLATFORM_LABELS[pub.platform]}</td>
                  {showOwner ? <td className={tdClass}>{ownerLabel(pub.owner_id)}</td> : null}
                  <td className={tdClass}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PublicationStatusBadge status={pub.status} />
                      {pub.synthetic_media ? <AiBadge /> : null}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {pub.scheduled_at ? new Date(pub.scheduled_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className={tdClass}>
                    {pub.published_at ? new Date(pub.published_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className={`${tdClass} max-w-xs`}>
                    {pub.block_reasons && pub.block_reasons.length > 0 ? (
                      <ul className="list-disc pl-4 text-xs text-danger">
                        {pub.block_reasons.map((r) => (
                          <li key={r}>{blockReasonLabel(r)}</li>
                        ))}
                      </ul>
                    ) : pub.error ? (
                      <span className="text-xs text-danger">{pub.error}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${tdClass} space-x-3 whitespace-nowrap`}>
                    {pub.external_url ? (
                      <a
                        href={pub.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary-text hover:underline"
                      >
                        Ver publicação
                      </a>
                    ) : null}
                    {pub.status === "scheduled" ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(pub)}
                        disabled={actioningId === pub.id}
                        className="font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    {pub.status === "published" ? (
                      <button
                        type="button"
                        onClick={() => setTakedownTarget(pub)}
                        className="font-medium text-danger hover:underline"
                      >
                        Retirar do ar
                      </button>
                    ) : null}
                    {pub.status === "exported" ? (
                      <a
                        href={publicationExportUrl(pub.id)}
                        className="font-medium text-primary-text hover:underline"
                      >
                        Baixar pacote
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={takedownTarget !== null} onClose={() => setTakedownTarget(null)} title="Retirar do ar">
        {takedownTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">
              Tem certeza de que deseja retirar esta publicação do ar em{" "}
              <span className="font-semibold">{PLATFORM_LABELS[takedownTarget.platform]}</span>? A
              plataforma será notificada para remover o post publicado.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleTakedown}
                disabled={actioningId === takedownTarget.id}
                className="btn btn-danger"
              >
                {actioningId === takedownTarget.id ? "Enviando…" : "Retirar do ar"}
              </button>
              <button
                type="button"
                onClick={() => setTakedownTarget(null)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

const thClass =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted";
const tdClass = "px-4 py-3 text-fg";
