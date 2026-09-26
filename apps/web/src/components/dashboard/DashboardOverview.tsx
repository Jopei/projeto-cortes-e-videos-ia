"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { JOB_STATUS_LABELS, listJobs, type AnalysisJob } from "@/lib/jobs";
import { PUBLICATION_STATUS_LABELS } from "@/lib/publications";
import { CLIP_STATUS_LABELS } from "@/lib/clips";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobStatusBadge } from "@/components/ui/StatusBadges";

const POLL_INTERVAL_MS = 3000;

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
    </div>
  );
}

function BreakdownList({ counts, labels }: { counts: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum registro ainda.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map(([status, count]) => (
        <li
          key={status}
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {labels[status] ?? status}: <span className="font-semibold">{count}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardOverview() {
  const { selectedChannelId, selectedChannel } = useChannelContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<AnalysisJob[]>([]);

  const loadSummary = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getDashboardSummary(selectedChannelId || undefined, signal);
        setSummary(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar o resumo.");
      } finally {
        setLoading(false);
      }
    },
    [selectedChannelId],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  const loadActiveJobs = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [queued, running] = await Promise.all([
          listJobs({ status: "queued", channel_id: selectedChannelId || undefined }, signal),
          listJobs({ status: "running", channel_id: selectedChannelId || undefined }, signal),
        ]);
        setActiveJobs([...running, ...queued]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // best-effort widget: keep last known list on transient errors
      }
    },
    [selectedChannelId],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadActiveJobs(controller.signal);
    const interval = window.setInterval(() => loadActiveJobs(), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadActiveJobs]);

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="sr-only">
        {loading ? "Carregando resumo…" : "Resumo atualizado."}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        {selectedChannel ? (
          <>
            Mostrando dados do canal <span className="font-semibold">{selectedChannel.name}</span>. Troque
            o canal na barra lateral para ver outro, ou selecione &quot;Todos os canais&quot;.
          </>
        ) : (
          "Mostrando dados de todos os canais. Selecione um canal na barra lateral para filtrar."
        )}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loading && !summary ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Uploads" value={summary.uploads_total} />
          <StatCard label="Jobs ativos" value={summary.jobs_active} />
          <StatCard
            label="Aguardando revisão"
            value={summary.clips_by_status.pending_review ?? 0}
          />
          <StatCard
            label="Publicações agendadas"
            value={summary.publications_by_status.scheduled ?? 0}
          />
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Cortes por status</h2>
          {summary ? (
            <BreakdownList counts={summary.clips_by_status} labels={CLIP_STATUS_LABELS} />
          ) : (
            <SkeletonList rows={2} />
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Publicações por status
          </h2>
          {summary ? (
            <BreakdownList counts={summary.publications_by_status} labels={PUBLICATION_STATUS_LABELS} />
          ) : (
            <SkeletonList rows={2} />
          )}
        </div>
      </section>

      <section
        aria-labelledby="active-jobs-heading"
        className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between">
          <h2 id="active-jobs-heading" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Jobs ativos
          </h2>
          <Link href="/cortes/jobs" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Ver todos
          </Link>
        </div>
        <div aria-live="polite">
          {activeJobs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum job em andamento.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeJobs.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-col gap-1 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {job.stage ?? JOB_STATUS_LABELS[job.status]}
                    </span>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={job.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progresso do job ${job.id}`}
                    className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                  >
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        aria-labelledby="upcoming-heading"
        className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between">
          <h2 id="upcoming-heading" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Próximos agendamentos
          </h2>
          <Link href="/cortes/agenda" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Ver agenda
          </Link>
        </div>
        {summary && summary.upcoming_publications.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {summary.upcoming_publications.map((pub) => (
              <li
                key={pub.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"
              >
                <span className="text-slate-700 dark:text-slate-200">{pub.platform}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {pub.scheduled_at ? new Date(pub.scheduled_at).toLocaleString("pt-BR") : "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : summary ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum agendamento futuro.</p>
        ) : (
          <SkeletonList rows={2} />
        )}
      </section>

      <section aria-labelledby="shortcuts-heading" className="flex flex-col gap-2">
        <h2 id="shortcuts-heading" className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Atalhos
        </h2>
        <div className="flex flex-wrap gap-2">
          <ShortcutLink href="/cortes/upload" label="Enviar vídeo" />
          <ShortcutLink href="/cortes/revisao" label="Revisar cortes" />
          <ShortcutLink href="/cortes/publicacoes" label="Ver publicações" />
          <ShortcutLink href="/cortes/canais" label="Gerenciar canais" />
        </div>
      </section>

      {summary && summary.uploads_total === 0 ? (
        <EmptyState
          title="Nenhum vídeo enviado ainda"
          description="Envie um vídeo-fonte para começar a gerar cortes."
          action={
            <Link
              href="/cortes/upload"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Ir para Upload
            </Link>
          }
        />
      ) : null}
    </div>
  );
}

function ShortcutLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {label}
    </Link>
  );
}
