"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import {
  JOB_ACTIVE_STATUSES,
  JOB_STATUS_LABELS,
  PRESET_LABELS,
  cancelJob,
  listJobs,
  type AnalysisJob,
  type AnalysisJobStatus,
} from "@/lib/jobs";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { JobStatusBadge } from "@/components/ui/StatusBadges";
import { useToast } from "@/components/ui/Toast";

const POLL_INTERVAL_MS = 3000;
const STATUS_FILTERS: (AnalysisJobStatus | "")[] = ["", "queued", "running", "done", "failed", "canceled"];

export function JobsManager() {
  const { selectedChannelId } = useChannelContext();
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();
  const [statusFilter, setStatusFilter] = useState<AnalysisJobStatus | "">("");
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const hasActiveRef = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await listJobs(
          { channel_id: selectedChannelId || undefined, status: statusFilter || undefined },
          signal,
        );
        setJobs(data);
        hasActiveRef.current = data.some((j) => JOB_ACTIVE_STATUSES.includes(j.status));
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar os jobs.");
      } finally {
        setLoading(false);
      }
    },
    [selectedChannelId, statusFilter],
  );

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (hasActiveRef.current) load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  async function handleCancel(job: AnalysisJob) {
    setCancelingId(job.id);
    try {
      await cancelJob(job.id);
      showToast("Job cancelado.", "success");
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao cancelar o job.", "error");
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="job-status-filter" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Status
        </label>
        <select
          id="job-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AnalysisJobStatus | "")}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? JOB_STATUS_LABELS[s] : "Todos"}
            </option>
          ))}
        </select>
      </div>

      <div aria-live="polite">
        {loading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Nenhum job encontrado"
            description="Analise um vídeo enviado na tela de Upload para criar um job."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <JobStatusBadge status={job.status} />
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      Preset: {PRESET_LABELS[job.preset]}
                    </span>
                    {showOwner ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Dono: {ownerLabel(job.owner_id)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Link
                      href={`/cortes/revisao?job_id=${job.id}`}
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Ver cortes
                    </Link>
                    {JOB_ACTIVE_STATUSES.includes(job.status) ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(job)}
                        disabled={cancelingId === job.id}
                        className="font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
                      >
                        {cancelingId === job.id ? "Cancelando…" : "Cancelar"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {job.stage ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Estágio: {job.stage}</p>
                ) : null}

                <div
                  role="progressbar"
                  aria-valuenow={job.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progresso do job de ${job.media_asset_id}`}
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      job.status === "failed" ? "bg-red-500" : "bg-indigo-600"
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>

                {job.error ? (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {job.error}
                  </p>
                ) : null}

                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Criado em {new Date(job.created_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
