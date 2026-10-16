"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { JOB_STATUS_LABELS, listJobs, type AnalysisJob } from "@/lib/jobs";
import { PUBLICATION_STATUS_LABELS, type Publication } from "@/lib/publications";
import { PLATFORM_LABELS } from "@/lib/channels";
import { CLIP_STATUS_LABELS } from "@/lib/clips";
import { listAccounts } from "@/lib/accounts";
import { listSources } from "@/lib/sources";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobStatusBadge } from "@/components/ui/StatusBadges";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

const POLL_INTERVAL_MS = 3000;

type Tone = "danger" | "warning" | "primary";
const TONE_BORDER: Record<Tone, string> = {
  danger: "border-t-danger",
  warning: "border-t-warning",
  primary: "border-t-primary",
};

function AttentionCard({ count, label, href, cta, tone }: { count: number; label: string; href: string; cta: string; tone: Tone }) {
  return (
    <Link
      href={href}
      className={`focus-ring group flex flex-col gap-1 rounded-xl border border-t-[3px] border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover dark:shadow-none dark:ring-1 dark:ring-white/5 ${TONE_BORDER[tone]}`}
    >
      <span className="text-3xl font-semibold tabular-nums text-fg">{count}</span>
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary-text">
        {cta} <Icon name="arrowRight" size={14} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="focus-ring block rounded-xl border border-border bg-surface p-4 shadow-card transition-shadow hover:border-border-strong hover:shadow-card-hover dark:shadow-none dark:ring-1 dark:ring-white/5"
    >
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${value === 0 ? "text-fg-subtle" : "text-fg"}`}>{value}</p>
    </Link>
  );
}

const SEGMENT_COLORS: Record<string, string> = {
  pending_review: "bg-warning",
  approved: "bg-success",
  rejected: "bg-danger",
  failed: "bg-danger",
  rendering: "bg-info",
  scheduled: "bg-info",
  publishing: "bg-info",
  published: "bg-success",
  blocked: "bg-danger",
  canceled: "bg-fg-subtle",
  taken_down: "bg-warning",
  exported: "bg-fg-subtle",
};

/** Single stacked bar + legend; renders nothing when everything is zero. */
function StackedBar({ title, counts, labels }: { title: string; counts: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(counts).filter(([, c]) => c > 0);
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (total === 0) return null;
  return (
    <Card>
      <CardHeader title={title} />
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-border" role="img" aria-label={entries.map(([k, c]) => `${labels[k] ?? k}: ${c}`).join(", ")}>
        {entries.map(([k, c]) => (
          <span key={k} className={SEGMENT_COLORS[k] ?? "bg-primary"} style={{ width: `${(c / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
        {entries.map(([k, c]) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${SEGMENT_COLORS[k] ?? "bg-primary"}`} />
            {labels[k] ?? k}: <span className="font-semibold tabular-nums text-fg">{c}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DashboardOverview() {
  const { selectedChannelId, selectedChannel, channels } = useChannelContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<AnalysisJob[]>([]);
  const [setup, setSetup] = useState<{ sources: number; accounts: number } | null>(null);

  const loadSummary = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        setSummary(await getDashboardSummary(selectedChannelId || undefined, signal));
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
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listSources(controller.signal), listAccounts(undefined, controller.signal)])
      .then(([sources, accounts]) => setSetup({ sources: sources.length, accounts: accounts.length }))
      .catch(() => {
        /* best-effort: checklist falls back to what the summary knows */
      });
    return () => controller.abort();
  }, []);

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
      }
    },
    [selectedChannelId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadActiveJobs(controller.signal);
    const interval = window.setInterval(() => void loadActiveJobs(), POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadActiveJobs]);

  const a = summary?.attention;
  const pendingReview = summary?.clips_by_status.pending_review ?? 0;
  const attentionCards: React.ComponentProps<typeof AttentionCard>[] = a
    ? [
        { count: a.publications_failed, label: a.publications_failed === 1 ? "publicação falhou" : "publicações falharam", href: "/cortes/publicacoes", cta: "Ver", tone: "danger" as Tone },
        { count: a.jobs_failed_recent, label: a.jobs_failed_recent === 1 ? "job falhou recentemente" : "jobs falharam recentemente", href: "/cortes/jobs", cta: "Ver", tone: "danger" as Tone },
        { count: a.clips_pending_review, label: a.clips_pending_review === 1 ? "corte aguardando revisão" : "cortes aguardando revisão", href: "/cortes/revisao", cta: "Revisar", tone: "warning" as Tone },
        { count: a.episodes_awaiting_script_approval, label: a.episodes_awaiting_script_approval === 1 ? "episódio aguarda aprovação de roteiro" : "episódios aguardam aprovação de roteiro", href: "/series", cta: "Abrir", tone: "warning" as Tone },
        { count: a.episodes_pending_review, label: a.episodes_pending_review === 1 ? "episódio aguarda revisão do vídeo" : "episódios aguardam revisão do vídeo", href: "/series", cta: "Abrir", tone: "warning" as Tone },
        { count: a.series_paused, label: a.series_paused === 1 ? "série pausada" : "séries pausadas", href: "/series", cta: "Ver", tone: "primary" as Tone },
      ].filter((c) => c.count > 0)
    : [];

  const noChannels = channels.length === 0;
  const noVideo = summary ? summary.uploads_total === 0 : false;
  const firstUse = Boolean(summary && setup && noChannels && setup.sources === 0 && noVideo);
  const steps = [
    { done: !noChannels, title: "Criar um canal", text: "Agrupa contas, presets e templates.", href: "/cortes/canais", cta: "Criar canal" },
    { done: (setup?.sources ?? 0) > 0, title: "Cadastrar uma fonte e licença", text: "Nada é publicado sem licença válida.", href: "/cortes/fontes-licencas", cta: "Cadastrar fonte" },
    { done: !noVideo, title: "Enviar um vídeo", text: "O vídeo-fonte que vira cortes verticais.", href: "/cortes/upload", cta: "Enviar vídeo" },
    { done: (setup?.accounts ?? 0) > 0, title: "Conectar uma conta", text: "Onde os cortes serão publicados.", href: "/cortes/contas", cta: "Conectar conta" },
  ];

  const upcoming: Publication[] = summary?.upcoming_publications.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Visão geral"
        description="O que precisa de você agora e como está o pipeline de cortes."
        meta={<Badge variant="neutral">{selectedChannel ? `Canal: ${selectedChannel.name}` : "Todos os canais"}</Badge>}
        actions={
          <>
            <Button href="/cortes/upload">
              <Icon name="upload" size={16} /> Enviar vídeo
            </Button>
            <Button href="/cortes/revisao" variant="secondary">
              Revisar cortes{pendingReview > 0 ? ` (${pendingReview})` : ""}
            </Button>
          </>
        }
      />

      <div aria-live="polite" className="sr-only">
        {loading ? "Carregando resumo…" : "Resumo atualizado."}
      </div>

      {error ? (
        <Callout variant="danger" role="alert" title="Não foi possível carregar o resumo" action={<Button variant="secondary" size="sm" onClick={() => void loadSummary()}>Tentar de novo</Button>}>
          {error}
        </Callout>
      ) : null}

      {loading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : null}

      {firstUse ? (
        <Card as="section" aria-labelledby="start-heading">
          <CardHeader id="start-heading" title="Comece por aqui" description="Quatro passos até o primeiro corte publicado." />
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-xl border border-border p-4">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    step.done ? "bg-success text-white dark:text-slate-900" : "bg-surface-2 text-fg-muted"
                  }`}
                >
                  {step.done ? <Icon name="check" size={16} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    {step.title}
                    {step.done ? <span className="sr-only"> (concluído)</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-muted">{step.text}</p>
                  {!step.done ? (
                    <Button href={step.href} size="sm" variant={i === steps.findIndex((s) => !s.done) ? "primary" : "secondary"} className="mt-3">
                      {step.cta}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : summary?.attention ? (
        <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
          <h2 id="attention-heading" className="text-base font-semibold text-fg">
            Precisa da sua atenção
          </h2>
          {attentionCards.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {attentionCards.map((c) => (
                <AttentionCard key={c.label} {...c} />
              ))}
            </div>
          ) : (
            <Callout variant="success" title="Tudo em dia">
              Nada aguardando revisão, nenhuma falha recente.
            </Callout>
          )}
        </section>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Aguardando revisão" value={pendingReview} href="/cortes/revisao" />
          <StatCard label="Jobs ativos" value={summary.jobs_active} href="/cortes/jobs" />
          <StatCard label="Agendadas" value={summary.publications_by_status.scheduled ?? 0} href="/cortes/agenda" />
          <StatCard label="Publicadas" value={summary.publications_by_status.published ?? 0} href="/cortes/publicacoes" />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card as="section" aria-labelledby="upcoming-heading" className="lg:col-span-2">
          <CardHeader
            id="upcoming-heading"
            title="Próximos agendamentos"
            action={
              <Link href="/cortes/agenda" className="focus-ring rounded text-sm font-medium text-primary-text hover:underline">
                Ver agenda
              </Link>
            }
          />
          {upcoming.length > 0 ? (
            <ul className="divide-y divide-border">
              {upcoming.map((pub) => (
                <li key={pub.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium text-fg">{PLATFORM_LABELS[pub.platform] ?? pub.platform}</span>
                  <span className="tabular-nums text-fg-muted">
                    {pub.scheduled_at ? new Date(pub.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : summary ? (
            <EmptyState variant="inline" title="Nenhum agendamento futuro." action={<Button href="/cortes/revisao" variant="secondary" size="sm">Ir para Revisão</Button>} />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Card>

        <Card as="section" aria-labelledby="active-jobs-heading">
          <CardHeader
            id="active-jobs-heading"
            title="Jobs em andamento"
            action={
              <Link href="/cortes/jobs" className="focus-ring rounded text-sm font-medium text-primary-text hover:underline">
                Ver todos
              </Link>
            }
          />
          <div aria-live="polite">
            {activeJobs.length === 0 ? (
              <EmptyState variant="inline" title="Nenhum job em andamento." />
            ) : (
              <ul className="flex flex-col gap-3">
                {activeJobs.map((job) => (
                  <li key={job.id} className="flex flex-col gap-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-fg-muted">{job.stage ?? JOB_STATUS_LABELS[job.status]}</span>
                      <JobStatusBadge status={job.status} />
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={job.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progresso do job ${job.id}`}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                    >
                      <div className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none" style={{ width: `${job.progress}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {summary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <StackedBar title="Cortes por status" counts={summary.clips_by_status} labels={CLIP_STATUS_LABELS} />
          <StackedBar title="Publicações por status" counts={summary.publications_by_status} labels={PUBLICATION_STATUS_LABELS} />
        </div>
      ) : null}
    </div>
  );
}
