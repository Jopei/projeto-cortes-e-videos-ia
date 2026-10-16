"use client";

import { useMemo } from "react";
import { formatDateShort, formatDateTimeShort, formatUsd } from "@/lib/format";
import {
  ARC_PHASE_LABELS,
  EPISODE_ATTENTION_PRIORITY,
  PRIVACY_OPTIONS,
  nextActionText,
  seriesSpent,
  type EpisodeStatus,
  type EpisodeSummary,
  type SeriesDetail,
} from "@/lib/series";
import { UsageBar } from "@/components/ui/UsageBar";
import { EpisodeStatusBadge } from "@/components/series/badges";
import { cardClass, secondaryButton } from "@/components/series/common";

const DOT_CLASS: Record<string, string> = {
  done: "bg-emerald-500 border-emerald-600",
  wait: "bg-amber-500 border-amber-600",
  work: "bg-primary-hover border-indigo-600",
  fail: "bg-red-500 border-red-600",
  idle: "bg-border border-slate-400",
};

function dotKind(status: EpisodeStatus): keyof typeof DOT_CLASS {
  if (["approved", "scheduled", "published"].includes(status)) return "done";
  if (["awaiting_script_approval", "pending_review", "stale"].includes(status)) return "wait";
  if (["needs_attention", "rejected"].includes(status)) return "fail";
  if (["scripting", "validating", "script_ready", "generating_media", "assembling"].includes(status)) return "work";
  return "idle";
}

export function OverviewTab({
  series,
  onOpenEpisode,
  onEditSettings,
}: {
  series: SeriesDetail;
  onOpenEpisode: (n: number) => void;
  onEditSettings: () => void;
}) {
  const episodes = series.episodes;
  const todayIso = new Date().toISOString().slice(0, 10);

  const attention = useMemo(() => {
    const rank = (s: EpisodeStatus) => EPISODE_ATTENTION_PRIORITY.indexOf(s);
    return episodes
      .filter((e) => rank(e.status) >= 0)
      .sort((a, b) => rank(a.status) - rank(b.status) || a.number - b.number);
  }, [episodes]);

  const counts = useMemo(
    () => ({
      published: episodes.filter((e) => e.status === "published").length,
      scheduled: episodes.filter((e) => e.status === "scheduled" || e.status === "approved").length,
      waiting: episodes.filter((e) => ["awaiting_script_approval", "pending_review", "stale"].includes(e.status)).length,
      failed: episodes.filter((e) => e.status === "needs_attention" || e.status === "rejected").length,
    }),
    [episodes],
  );

  const nextPlanned = episodes.find((e) => !["published", "scheduled", "approved", "canceled"].includes(e.status));
  const phases = useMemo(() => {
    const groups: { phase: EpisodeSummary["arc_phase"]; from: number; to: number }[] = [];
    for (const e of episodes) {
      const last = groups[groups.length - 1];
      if (last && last.phase === e.arc_phase) last.to = e.number;
      else groups.push({ phase: e.arc_phase, from: e.number, to: e.number });
    }
    return groups;
  }, [episodes]);

  const spent = seriesSpent(series);
  const remaining =
    series.estimated_cost && spent != null ? Math.max(0, series.estimated_cost.season_usd - spent) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className={cardClass} aria-labelledby="next-step-heading">
          <h2 id="next-step-heading" className="mb-2 text-base font-semibold text-fg">
            Próximo passo para você
          </h2>
          {attention.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {attention.map((e) => (
                <li key={e.id} className="border-warning/40 bg-warning-soft text-fg flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <span className="text-fg">{nextActionText(e.status, e.number)}</span>
                  <button type="button" onClick={() => onOpenEpisode(e.number)} className={secondaryButton}>
                    Revisar episódio
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">
              Nada pendente.
              {nextPlanned
                ? ` O próximo episódio é o Ep. ${nextPlanned.number}${nextPlanned.target_date ? `, em ${formatDateShort(nextPlanned.target_date)} às ${series.publish_time.slice(0, 5)}` : ""}.`
                : ""}
            </p>
          )}
        </section>

        <section className={cardClass} aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="mb-3 text-base font-semibold text-fg">
            Linha do tempo ({episodes.length} episódios)
          </h2>
          <ol className="flex flex-col gap-1 lg:flex-row lg:overflow-x-auto lg:pb-2">
            {episodes.map((e) => {
              const shifted =
                e.scheduled_at && e.target_date && e.scheduled_at.slice(0, 10) > e.target_date.slice(0, 10)
                  ? Math.round((new Date(e.scheduled_at.slice(0, 10)).getTime() - new Date(e.target_date.slice(0, 10)).getTime()) / 86400000)
                  : 0;
              const isToday = e.target_date?.slice(0, 10) === todayIso;
              return (
                <li key={e.id} className="lg:w-28 lg:shrink-0" aria-current={isToday ? "date" : undefined}>
                  <button
                    type="button"
                    onClick={() => onOpenEpisode(e.number)}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-surface-2 focus-ring lg:flex-col lg:items-start"
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full border ${DOT_CLASS[dotKind(e.status)]}`} />
                      <span className="text-sm font-semibold text-fg">Ep. {e.number}</span>
                      {isToday ? <span className="rounded bg-primary px-1 text-[10px] font-semibold text-white">Hoje</span> : null}
                    </span>
                    <span className="min-w-0 flex-1 lg:w-full">
                      <span className="block text-xs text-fg-muted">
                        {formatDateShort(e.target_date)}
                        {series.publish_time ? ` ${series.publish_time.slice(0, 5)}` : ""}
                      </span>
                      <span className="block truncate text-xs text-fg-muted">{e.title}</span>
                      {shifted > 0 ? (
                        <span
                          className="block text-xs text-amber-700 dark:text-amber-300"
                          title="A agenda foi empurrada porque um episódio anterior não ficou pronto a tempo."
                        >
                          adiado {shifted} dia{shifted > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </span>
                    <EpisodeStatusBadge status={e.status} />
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-sm text-fg-muted">
            Publicados {counts.published} · Agendados {counts.scheduled} · Aguardando você {counts.waiting} · Falhas {counts.failed}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Arco:{" "}
            {phases.map((p, i) => (
              <span key={`${p.phase}-${p.from}`}>
                {i > 0 ? " | " : ""}
                {ARC_PHASE_LABELS[p.phase]} {p.from === p.to ? p.from : `${p.from}-${p.to}`}
              </span>
            ))}
          </p>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className={cardClass} aria-labelledby="cost-card-heading">
          <h2 id="cost-card-heading" className="mb-2 text-base font-semibold text-fg">
            Custo
          </h2>
          {spent != null ? (
            <UsageBar label="Acumulado" used={spent} quota={series.budget_limit_usd} formatValue={formatUsd} />
          ) : (
            <p className="text-sm text-fg-muted">Limite: {series.budget_limit_usd != null ? formatUsd(series.budget_limit_usd) : "sem limite"}</p>
          )}
          {series.estimated_cost ? (
            <p className="mt-2 text-xs text-fg-muted">
              Estimado: {formatUsd(series.estimated_cost.per_episode_usd)}/episódio · {formatUsd(series.estimated_cost.season_usd)}/temporada
              {remaining != null ? ` · restante ~${formatUsd(remaining)}` : ""}
            </p>
          ) : null}
        </section>

        <section className={cardClass} aria-labelledby="config-card-heading">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="config-card-heading" className="text-base font-semibold text-fg">
              Configuração
            </h2>
            <button type="button" onClick={onEditSettings} className="text-sm font-medium text-primary-text hover:underline">
              Editar
            </button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {[
              ["Estilo", { economy: "Economia", hybrid: `Híbrido (${series.max_video_scenes_per_episode} cena(s) em vídeo)`, full_video: "Vídeo completo" }[series.visual_strategy]],
              ["Imagem", series.image_provider ?? "—"],
              ["Vídeo", series.video_provider ?? "—"],
              ["Voz", `${series.tts_provider ?? "—"}${series.tts_voice_id ? ` · ${series.tts_voice_id}` : ""}`],
              ["Horário", `${series.publish_time.slice(0, 5)} (${series.timezone})`],
              ["Antecedência", `${series.lead_days} dia(s)`],
              ["Privacidade", PRIVACY_OPTIONS.find((o) => o.value === series.privacy)?.label ?? series.privacy],
              ["Regenerações", `até ${series.max_regenerations_per_episode} por episódio`],
              ["Aprovar roteiro", series.require_script_approval ? "Sim" : "Não"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-subtle">{k}</dt>
                <dd className="break-words text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {series.status === "planned" ? (
            <p className="mt-3 text-xs text-fg-subtle">
              Criada em {formatDateTimeShort(series.created_at)}
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

