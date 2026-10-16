"use client";

import { AiBadge } from "@/components/series/badges";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { MoreMenu, type MoreMenuItem } from "@/components/ui/MoreMenu";
import { PageHeader } from "@/components/ui/PageHeader";
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

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function PublicacoesManager() {
  const { selectedChannelId } = useChannelContext();
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();
  const [statusFilter, setStatusFilter] = useState<PublicationStatus | "">("");
  const [platformFilter, setPlatformFilter] = useState<PlatformValue | "">("");
  const [all, setAll] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [takedownTarget, setTakedownTarget] = useState<Publication | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Publication | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        setAll(await listPublications({ channel_id: selectedChannelId || undefined }, signal));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar as publicações.");
      } finally {
        setLoading(false);
      }
    },
    [selectedChannelId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const byPlatform = useMemo(() => (platformFilter ? all.filter((p) => p.platform === platformFilter) : all), [all, platformFilter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of byPlatform) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [byPlatform]);
  const publications = useMemo(() => (statusFilter ? byPlatform.filter((p) => p.status === statusFilter) : byPlatform), [byPlatform, statusFilter]);

  async function handleCancel() {
    if (!cancelTarget) return;
    setActioningId(cancelTarget.id);
    try {
      await cancelPublication(cancelTarget.id);
      showToast("Publicação cancelada.", "success");
      setCancelTarget(null);
      void load();
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
      void load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao retirar do ar.", "error");
    } finally {
      setActioningId(null);
    }
  }

  const columns: Column<Publication>[] = [
    { id: "platform", header: "Plataforma", primary: true, cell: (p) => PLATFORM_LABELS[p.platform] },
    ...(showOwner ? [{ id: "owner", header: "Dono", cell: (p: Publication) => ownerLabel(p.owner_id) }] : []),
    {
      id: "status",
      header: "Status",
      cell: (p) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <PublicationStatusBadge status={p.status} />
          {p.synthetic_media ? <AiBadge /> : null}
        </span>
      ),
    },
    { id: "scheduled", header: "Agendado para", cell: (p) => fmt(p.scheduled_at) },
    { id: "published", header: "Publicado em", cell: (p) => fmt(p.published_at) },
    {
      id: "issue",
      header: "Erro / bloqueio",
      className: "max-w-xs",
      cell: (p) =>
        p.block_reasons && p.block_reasons.length > 0 ? (
          <div className="rounded-lg border border-danger/30 bg-danger-soft p-2 text-xs text-fg">
            <p className="flex items-center gap-1 font-semibold text-danger">
              <Icon name="shield" size={12} /> Bloqueado pelo rights gate
            </p>
            <ul className="mt-1 list-disc pl-4">
              {p.block_reasons.map((r) => (
                <li key={r}>{blockReasonLabel(r)}</li>
              ))}
            </ul>
          </div>
        ) : p.error ? (
          <span className="text-xs text-danger">{p.error}</span>
        ) : (
          "—"
        ),
    },
  ];

  function rowActions(pub: Publication) {
    const menu: MoreMenuItem[] = [];
    if (pub.status === "scheduled") menu.push({ label: "Cancelar agendamento", danger: true, disabled: actioningId === pub.id, onSelect: () => setCancelTarget(pub) });
    if (pub.status === "published") menu.push({ label: "Retirar do ar", danger: true, onSelect: () => setTakedownTarget(pub) });
    return (
      <>
        {pub.external_url ? (
          <a href={pub.external_url} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
            Ver publicação
          </a>
        ) : null}
        {pub.status === "exported" ? (
          <a href={publicationExportUrl(pub.id)} className={buttonClasses("secondary", "sm")}>
            Baixar pacote
          </a>
        ) : null}
        {menu.length > 0 ? <MoreMenu label={`${PLATFORM_LABELS[pub.platform]}`} items={menu} /> : null}
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Publicações"
        description="Histórico e status das publicações dos cortes aprovados em YouTube Shorts, TikTok, Bilibili, Reels e Vimeo."
      />

      <div className="mb-4 flex flex-col gap-3">
        <div role="group" aria-label="Filtrar por status" className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s;
            const n = s ? counts[s] ?? 0 : byPlatform.length;
            return (
              <button
                key={s || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(s)}
                className={`focus-ring inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors md:min-h-[36px] ${
                  active
                    ? "border-primary bg-primary-soft text-primary-text"
                    : "border-border-strong bg-surface text-fg-muted hover:bg-surface-2"
                }`}
              >
                {s ? PUBLICATION_STATUS_LABELS[s] : "Todas"}
                <span className="tabular-nums text-xs text-fg-subtle">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pub-platform-filter" className="text-sm font-medium text-fg">
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
        <Callout variant="danger" role="alert" title="Não foi possível carregar as publicações" action={<Button variant="secondary" size="sm" onClick={() => void load()}>Tentar de novo</Button>}>
          {error}
        </Callout>
      ) : publications.length === 0 ? (
        <EmptyState
          icon="send"
          title="Nenhuma publicação encontrada"
          description={all.length > 0 ? "Nenhuma publicação com esses filtros." : "Publique cortes aprovados na tela de Revisão para vê-los aqui."}
          action={
            all.length > 0 ? (
              <Button variant="secondary" onClick={() => { setStatusFilter(""); setPlatformFilter(""); }}>
                Limpar filtros
              </Button>
            ) : (
              <Button href="/cortes/revisao">Ir para Revisão</Button>
            )
          }
        />
      ) : (
        <DataTable caption="Publicações" columns={columns} rows={publications} rowKey={(p) => p.id} actions={rowActions} />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancelar agendamento"
        confirmLabel="Cancelar agendamento"
        cancelLabel="Manter"
        busy={actioningId !== null && actioningId === cancelTarget?.id}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      >
        A publicação em <span className="font-semibold text-fg">{cancelTarget ? PLATFORM_LABELS[cancelTarget.platform] : ""}</span> deixará de ser agendada.
      </ConfirmDialog>

      <ConfirmDialog
        open={takedownTarget !== null}
        title="Retirar do ar"
        confirmLabel="Retirar do ar"
        busy={actioningId !== null && actioningId === takedownTarget?.id}
        onConfirm={handleTakedown}
        onCancel={() => setTakedownTarget(null)}
      >
        Tem certeza de que deseja retirar esta publicação do ar em{" "}
        <span className="font-semibold text-fg">{takedownTarget ? PLATFORM_LABELS[takedownTarget.platform] : ""}</span>? A
        plataforma será notificada para remover o post publicado.
      </ConfirmDialog>
    </div>
  );
}
