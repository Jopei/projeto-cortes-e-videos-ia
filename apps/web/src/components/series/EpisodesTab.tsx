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
  const [onlyAttention, setOnlyAttention] = useState(false);
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
        <div role="group" aria-label="Modo de exibição" className="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => changeView(v)}
              className={`min-h-[36px] px-3 py-1.5 text-sm font-medium ${view === v ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}
            >
              {v === "grid" ? "Grade" : "Lista"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="h-4 w-4" />
          Precisam de ação
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          Fase
          <select value={phase} onChange={(e) => setPhase(e.target.value as ArcPhase | "")} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900">
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum episódio com esses filtros.</p>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        className={`${cardClass} flex h-full w-full flex-col gap-1.5 p-2 text-left hover:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500`}
      >
        <span className="relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded bg-slate-200 text-2xl font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated endpoint, next/image can't proxy cookies
            <img src={clipThumbnailUrl(e.clip_id!)} alt="" loading="lazy" onError={() => setThumbFailed(true)} className="h-full w-full object-cover" />
          ) : (
            e.number
          )}
        </span>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">Ep. {e.number}</span>
        <span className="line-clamp-2 text-xs text-slate-700 dark:text-slate-200">{e.title}</span>
        <ArcPhaseChip phase={e.arc_phase} />
        <EpisodeStatusBadge status={e.status} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatDateShort(e.target_date)} {publishTime.slice(0, 5)} · {formatUsd(e.cost_usd ?? 0)}
        </span>
        {e.error && (e.status === "needs_attention" || e.status === "stale") ? (
          <span className="line-clamp-2 text-xs text-red-700 dark:text-red-300">{e.error.split("\n")[0]}</span>
        ) : null}
      </button>
    </li>
  );
}

function EpisodeList({ episodes, maxRegens, onOpen }: { episodes: EpisodeSummary[]; maxRegens: number; onOpen: (n: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <caption className="sr-only">Episódios da série</caption>
        <thead className="bg-slate-50 dark:bg-slate-900">
          <tr>
            {["Nº", "Título", "Fase", "Status", "Data", "Custo", "Regenerações"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
          {episodes.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2">
                <button type="button" onClick={() => onOpen(e.number)} className="font-semibold text-indigo-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400" aria-label={`Abrir episódio ${e.number}`}>
                  {e.number}
                </button>
              </td>
              <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                {e.title}
                {e.error && (e.status === "needs_attention" || e.status === "stale") ? (
                  <span className="block text-xs text-red-700 dark:text-red-300">{e.error.split("\n")[0]}</span>
                ) : null}
              </td>
              <td className="px-3 py-2"><ArcPhaseChip phase={e.arc_phase} /></td>
              <td className="px-3 py-2"><EpisodeStatusBadge status={e.status} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-200">{formatDateShort(e.target_date)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-200">{formatUsd(e.cost_usd ?? 0)}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{e.regenerations}/{maxRegens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
