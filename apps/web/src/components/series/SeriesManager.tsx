"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useMemo, useState } from "react";
import { useOwnerLabel, useShowOwnerColumn } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import { formatDateShort, formatUsd } from "@/lib/format";
import {
  EPISODE_COUNT,
  PAUSE_REASON_LABELS,
  SERIES_STATUS_LABELS,
  SERIES_STATUSES,
  nextActionText,
  seriesApi,
  seriesAttentionCount,
  seriesSpent,
  type Series,
  type SeriesStatus,
} from "@/lib/series";
import { useResource } from "@/lib/use-resource";
import { usePolling } from "@/lib/use-polling";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { UsageBar } from "@/components/ui/UsageBar";
import { SeriesStatusBadge } from "@/components/series/badges";
import { EpisodeProgressBar } from "@/components/series/EpisodeProgressBar";
import { LoadError, Notice, UnavailableNotice, primaryButton } from "@/components/series/common";

function sortSeries(list: Series[]): Series[] {
  const rank = (s: Series) => (seriesAttentionCount(s) > 0 ? 0 : s.status === "active" ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

export function SeriesManager() {
  const { selectedChannelId, channels, loading: channelsLoading } = useChannelContext();
  const [statusFilter, setStatusFilter] = useState<SeriesStatus | "">("");
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  const res = useResource<Series[]>(
    (signal) => seriesApi.list({ channel_id: selectedChannelId || undefined, status: statusFilter || undefined }, signal),
    `${selectedChannelId}|${statusFilter}`,
    { errorFallback: "Não foi possível carregar as séries." },
  );
  const anyPlanning = (res.data ?? []).some((s) => s.status === "planning");
  const polling = usePolling(res.reload, { active: anyPlanning, resetKey: "list" });

  const sorted = useMemo(() => sortSeries(res.data ?? []), [res.data]);
  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="series-status-filter" className="text-sm font-medium text-fg-muted">
            Status
          </label>
          <select
            id="series-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SeriesStatus | "")}
            className="field-control"
          >
            <option value="">Todas</option>
            {SERIES_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SERIES_STATUS_LABELS[s].replace("…", "")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {polling.offline ? <Notice tone="warning" role="status">Sem conexão. Tentando de novo…</Notice> : null}
      {polling.stalled ? (
        <Notice
          tone="info"
          role="status"
          action={
            <button type="button" onClick={polling.refetch} className="text-sm font-medium underline">
              Atualizar
            </button>
          }
        >
          A atualização automática pausou.
        </Notice>
      ) : null}

      <div aria-busy={res.loading}>
        {res.loading ? (
          <SkeletonList rows={3} />
        ) : res.unavailable ? (
          <UnavailableNotice onRetry={res.reload} />
        ) : res.error && !res.data ? (
          <LoadError title="Não foi possível carregar as séries" message={res.error} onRetry={res.reload} />
        ) : sorted.length === 0 ? (
          !channelsLoading && channels.length === 0 ? (
            <EmptyState
              title="Você ainda não tem séries"
              description="Crie um canal com ao menos uma conta conectada antes de criar a primeira série."
              action={
                <Link href="/cortes/canais" className={primaryButton}>
                  Gerenciar canais
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="Você ainda não tem séries"
              description="Descreva uma ideia e a IA planeja 20 episódios de 30 segundos para você aprovar antes de gastar com mídia."
              action={
                <Link href="/series/nova" className={primaryButton}>
                  Criar primeira série
                </Link>
              }
            />
          )
        ) : (
          <>
            {res.error ? <LoadError message={res.error} onRetry={res.reload} /> : null}
            <ul className="grid gap-4 md:grid-cols-2">
              {sorted.map((s) => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  channel={s.channel_id ? channelById.get(s.channel_id) : undefined}
                  ownerText={showOwner ? ownerLabel(s.owner_id) : null}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function SeriesCard({
  series,
  channel,
  ownerText,
}: {
  series: Series;
  channel?: { name: string; color: string | null };
  ownerText: string | null;
}) {
  const attention = seriesAttentionCount(series);
  const spent = seriesSpent(series);
  const next = series.next_episode;
  return (
    <li>
      <Link
        href={`/series/${series.id}`}
        className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4 hover:border-primary focus-ring"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <ChannelColorDot color={channel?.color ?? null} />
            <span className="truncate">{channel?.name ?? "Canal"}</span>
          </span>
          <SeriesStatusBadge status={series.status} />
        </div>
        <h2 className="text-base font-semibold text-fg">{series.title || "Série sem título"}</h2>
        {ownerText ? <p className="text-xs text-fg-subtle">Dono: {ownerText}</p> : null}

        {series.status === "paused" && series.pause_reason ? (
          <p className="rounded-lg bg-warning-soft px-2 py-1 text-xs text-fg">
            {PAUSE_REASON_LABELS[series.pause_reason]}
          </p>
        ) : null}
        {series.status === "plan_failed" ? (
          <p className="text-xs text-danger">O planejamento falhou. Abra a série para replanejar.</p>
        ) : null}

        {series.status !== "planning" && series.status !== "plan_failed" ? (
          <EpisodeProgressBar progress={series.progress} total={EPISODE_COUNT} />
        ) : null}

        {next ? (
          <p className="text-sm text-fg-muted">
            Próximo: {nextActionText(next.status, next.number)}
            {next.target_date ? ` · ${formatDateShort(next.target_date)}` : ""}
          </p>
        ) : null}

        {series.budget_limit_usd != null && spent != null ? (
          <UsageBar label="Custo" used={spent} quota={series.budget_limit_usd} formatValue={formatUsd} />
        ) : (
          <p className="text-xs text-fg-muted">
            {series.budget_limit_usd == null ? "Sem limite de orçamento." : `Limite: ${formatUsd(series.budget_limit_usd)}.`}
            {spent != null ? ` Gasto: ${formatUsd(spent)}.` : ""}
          </p>
        )}
        {series.estimated_cost ? (
          <p className="text-xs text-fg-subtle">
            Estimado: {formatUsd(series.estimated_cost.per_episode_usd)}/episódio · {formatUsd(series.estimated_cost.season_usd)}/temporada
          </p>
        ) : null}

        {attention > 0 ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <Icon name="alert" size={14} />
            {attention === 1 ? "1 episódio precisa de atenção" : `${attention} episódios precisam de atenção`}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
