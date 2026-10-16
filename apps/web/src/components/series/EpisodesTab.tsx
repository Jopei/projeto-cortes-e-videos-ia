"use client";

import { useEffect, useMemo, useState } from "react";
import { clipThumbnailUrl } from "@/lib/clips";
import { formatDateShort, formatUsd } from "@/lib/format";
import { ARC_PHASE_LABELS, episodeNeedsAttention, type ArcPhase, type EpisodeSummary, type SeriesDetail } from "@/lib/series";
import { ArcPhaseChip, EpisodeStatusBadge } from "@/components/series/badges";
import { cardClass } from "@/components/series/common";

const VIEW_KEY = "cortes.series.episodes-view";

export function EpisodesTab({ series, onOpenEpisode }: { series: SeriesDetail; onOpenEpisode: (n: number) => void }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [onlyAttention, setOnlyAttention] = useState(() => series.episodes.some((e) => episodeNeedsAttention(e.status)));
  const [phase, setPhase] = useState<ArcPhase | "">("");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === "grid" || stored === "list") setView(stored);
  }, []);
  function changeView(v: "grid" | "list") {
    setView(v);
    window.localStorage.setItem(VIEW_KEY, v);
  }

  const episodes = useMemo(
    () =>
      series.episodes
        .filter((e) => (!onlyAttention || episodeNeedsAttention(e.status)) && (!phase || e.arc_phase === phase))
        .sort((a, b) => a.number - b.number),
    [series.episodes, onlyAttention, phase],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Modo de exibição" className="flex overflow-hidden rounded-lg border border-border-strong">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => changeView(v)}
              className={`min-h-[36px] px-3 py-1.5 text-sm font-medium ${view === v ? "bg-primary text-white" : "text-fg-muted hover:bg-surface-2"}`}
            >
              {v === "grid" ? "Grade" : "Lista"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="h-4 w-4" />
          Precisam de ação
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Fase
          <select value={phase} onChange={(e) => setPhase(e.target.value as ArcPhase | "")} className="field-control">
            <option value="">Todas</option>
            {(Object.keys(ARC_PHASE_LABELS) as ArcPhase[]).map((p) => (
              <option key={p} value={p}>
                {ARC_PHASE_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {episodes.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum episódio com esses filtros.</p>
      ) : view === "grid" ? (
        <ul className="flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {episodes.map((e) => (
            <EpisodeCard key={e.id} episode={e} publishTime={series.publish_time} onOpen={() => onOpenEpisode(e.number)} />
          ))}
        </ul>
      ) : (
        <EpisodeList episodes={episodes} maxRegens={series.max_regenerations_per_episode} onOpen={onOpenEpisode} />
      )}
    </div>
  );
}

function EpisodeCard({ episode: e, publishTime, onOpen }: { episode: EpisodeSummary; publishTime: string; onOpen: () => void }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const hasThumb = !!e.clip_id && !thumbFailed && ["pending_review", "approved", "scheduled", "published", "rejected"].includes(e.status);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`${cardClass} flex min-h-[56px] h-full w-full flex-row flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:border-primary focus-ring sm:flex-col sm:flex-nowrap sm:items-stretch sm:gap-1.5 sm:p-2`}
      >
        <span className="relative hidden aspect-[9/16] w-full items-center justify-center overflow-hidden rounded bg-border text-2xl font-semibold text-fg-subtle sm:flex">
          {hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated endpoint, next/image can't proxy cookies
            <img src={clipThumbnailUrl(e.clip_id!)} alt="" loading="lazy" onError={() => setThumbFailed(true)} className="h-full w-full object-cover" />
          ) : (
            e.number
          )}
        </span>
        <span className="text-sm font-semibold text-fg">Ep. {e.number}</span>
        <span className="line-clamp-2 min-w-0 flex-1 text-sm text-fg-muted sm:flex-none sm:text-xs">{e.title}</span>
        <span className="hidden sm:block"><ArcPhaseChip phase={e.arc_phase} /></span>
        <EpisodeStatusBadge status={e.status} />
        <span className="hidden text-xs text-fg-subtle sm:inline">
          {formatDateShort(e.target_date)} {publishTime.slice(0, 5)} · {formatUsd(e.cost_usd ?? 0)}
        </span>
        {e.error && (e.status === "needs_attention" || e.status === "stale") ? (
          <span className="line-clamp-2 text-xs text-danger">{e.error.split("\n")[0]}</span>
        ) : null}
      </button>
    </li>
  );
}

function EpisodeList({ episodes, maxRegens, onOpen }: { episodes: EpisodeSummary[]; maxRegens: number; onOpen: (n: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none">
      <table className="min-w-full divide-y divide-border text-sm">
        <caption className="sr-only">Episódios da série</caption>
        <thead className="bg-surface-2">
          <tr>
            {["Nº", "Título", "Fase", "Status", "Data", "Custo", "Regenerações"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-fg-subtle">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y bg-surface divide-border">
          {episodes.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2">
                <button type="button" onClick={() => onOpen(e.number)} className="font-semibold text-primary-text hover:underline focus-ring" aria-label={`Abrir episódio ${e.number}`}>
                  {e.number}
                </button>
              </td>
              <td className="px-3 py-2 text-fg">
                {e.title}
                {e.error && (e.status === "needs_attention" || e.status === "stale") ? (
                  <span className="block text-xs text-danger">{e.error.split("\n")[0]}</span>
                ) : null}
              </td>
              <td className="px-3 py-2"><ArcPhaseChip phase={e.arc_phase} /></td>
              <td className="px-3 py-2"><EpisodeStatusBadge status={e.status} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{formatDateShort(e.target_date)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{formatUsd(e.cost_usd ?? 0)}</td>
              <td className="px-3 py-2 text-fg-muted">{e.regenerations}/{maxRegens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
