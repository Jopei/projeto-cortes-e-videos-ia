"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOwnerLabel, useShowOwnerColumn } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import { formatUsd } from "@/lib/format";
import {
  EPISODE_ATTENTION_PRIORITY,
  EPISODE_COUNT,
  EPISODE_STATUS_LABELS,
  PAUSE_REASON_HINTS,
  PAUSE_REASON_LABELS,
  isEpisodeTransient,
  seriesApi,
  seriesSpent,
  type EpisodeStatus,
  type SeriesDetail,
} from "@/lib/series";
import { isAbort } from "@/lib/series-errors";
import { useResource } from "@/lib/use-resource";
import { usePolling } from "@/lib/use-polling";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SeriesStatusBadge, Spinner } from "@/components/series/badges";
import { BibleTab } from "@/components/series/BibleTab";
import { CostsTab } from "@/components/series/CostsTab";
import { EpisodeDrawer } from "@/components/series/EpisodeDrawer";
import { EpisodesTab } from "@/components/series/EpisodesTab";
import { OverviewTab } from "@/components/series/OverviewTab";
import {
  CancelDialog,
  DeleteDialog,
  ReplanDialog,
  SeriesSettingsDialog,
  StartDialog,
  type SeriesDialogKind,
} from "@/components/series/SeriesActionDialogs";
import {
  LoadError,
  Notice,
  UnavailableNotice,
  cardClass,
  dangerButton,
  primaryButton,
  secondaryButton,
} from "@/components/series/common";
import { useToast } from "@/components/ui/Toast";
import { seriesErrorMessage } from "@/lib/series-errors";

const TABS = [
  { id: "geral", label: "Visão geral" },
  { id: "biblia", label: "Bíblia" },
  { id: "episodios", label: "Episódios" },
  { id: "custos", label: "Custos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function SeriesDetailView({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useToast();
  const { channels } = useChannelContext();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  const res = useResource<SeriesDetail>((signal) => seriesApi.get(seriesId, signal), seriesId, {
    errorFallback: "Não foi possível carregar a série.",
  });
  const series = res.data;

  const tabParam = params.get("aba");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "geral";
  const epParam = Number(params.get("ep"));
  const openEpisode = Number.isInteger(epParam) && epParam >= 1 && epParam <= EPISODE_COUNT ? epParam : null;

  const [dialog, setDialog] = useState<SeriesDialogKind | null>(null);
  const [mobileActions, setMobileActions] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [busyAction, setBusyAction] = useState<"pause" | "resume" | null>(null);

  const transient =
    !!series && (series.status === "planning" || series.episodes.some((e) => isEpisodeTransient(e.status)));
  const polling = usePolling(res.reload, { active: transient, resetKey: `${series?.status}|${series?.episodes.map((e) => e.status).join(",")}` });

  // aria-live announcements for status changes (spec §9)
  const prevStatuses = useRef<Map<number, EpisodeStatus> | null>(null);
  useEffect(() => {
    if (!series) return;
    const current = new Map(series.episodes.map((e) => [e.number, e.status] as const));
    const prev = prevStatuses.current;
    if (prev) {
      for (const [n, status] of Array.from(current.entries())) {
        if (prev.has(n) && prev.get(n) !== status) {
          setAnnouncement(`Episódio ${n}: ${EPISODE_STATUS_LABELS[status].replace("…", "")}`);
          break;
        }
      }
    }
    prevStatuses.current = current;
  }, [series]);

  const buildUrl = useCallback(
    (next: { aba?: TabId; ep?: number | null }) => {
      const sp = new URLSearchParams(params.toString());
      if (next.aba !== undefined) sp.set("aba", next.aba);
      if (next.ep !== undefined) {
        if (next.ep === null) sp.delete("ep");
        else sp.set("ep", String(next.ep));
      }
      const qs = sp.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname],
  );

  const setTab = (t: TabId) => router.replace(buildUrl({ aba: t }), { scroll: false });
  const openEp = (n: number) => router.push(buildUrl({ ep: n, aba: tab === "geral" || tab === "episodios" ? undefined : "episodios" }), { scroll: false });
  const switchEp = (n: number) => router.replace(buildUrl({ ep: n }), { scroll: false });
  const closeEp = () => router.replace(buildUrl({ ep: null }), { scroll: false });

  const channel = useMemo(() => channels.find((c) => c.id === series?.channel_id), [channels, series?.channel_id]);
  const attentionEpisodes = useMemo(
    () => (series?.episodes ?? []).filter((e) => EPISODE_ATTENTION_PRIORITY.includes(e.status)).length,
    [series],
  );

  async function simpleAction(kind: "pause" | "resume") {
    if (!series) return;
    setBusyAction(kind);
    try {
      await seriesApi[kind](series.id);
      showToast(kind === "pause" ? "Série pausada." : "Série retomada.", "success");
      await res.reload();
    } catch (err) {
      showToast(seriesErrorMessage(err), "error");
      if (!isAbort(err)) void res.reload();
    } finally {
      setBusyAction(null);
    }
  }

  if (res.loading && !series) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (res.unavailable) return <UnavailableNotice onRetry={res.reload} />;
  if (res.notFound) {
    return (
      <EmptyState
        title="Série não encontrada"
        description="Ela pode ter sido excluída ou pertencer a outro usuário."
        action={
          <Link href="/series" className={primaryButton}>
            Voltar para Séries
          </Link>
        }
      />
    );
  }
  if (!series) {
    return <LoadError title="Não foi possível carregar a série" message={res.error ?? "Erro desconhecido."} onRetry={res.reload} />;
  }

  const status = series.status;
  const spent = seriesSpent(series);
  const actions: { key: string; label: string; onClick: () => void; variant: "primary" | "secondary" | "danger"; busy?: boolean }[] = [];
  if (status === "planned") {
    actions.push({ key: "start", label: "Iniciar série", onClick: () => setDialog("start"), variant: "primary" });
    actions.push({ key: "replan", label: "Replanejar", onClick: () => setDialog("replan"), variant: "secondary" });
  }
  if (status === "plan_failed") actions.push({ key: "replan", label: "Replanejar", onClick: () => setDialog("replan"), variant: "primary" });
  if (status === "active") actions.push({ key: "pause", label: busyAction === "pause" ? "Pausando…" : "Pausar", onClick: () => simpleAction("pause"), variant: "secondary", busy: busyAction !== null });
  if (status === "paused") actions.push({ key: "resume", label: busyAction === "resume" ? "Retomando…" : "Retomar", onClick: () => simpleAction("resume"), variant: "primary", busy: busyAction !== null });
  if (["planned", "planning", "active", "paused", "plan_failed"].includes(status)) actions.push({ key: "cancel", label: "Cancelar série", onClick: () => setDialog("cancel"), variant: "secondary" });
  if (["planned", "plan_failed", "canceled"].includes(status)) actions.push({ key: "delete", label: "Excluir", onClick: () => setDialog("delete"), variant: "danger" });

  const btnClass = (v: "primary" | "secondary" | "danger") => (v === "primary" ? primaryButton : v === "danger" ? dangerButton : secondaryButton);

  return (
    <div className="flex flex-col gap-4">
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <header className={`${cardClass} flex flex-col gap-2 md:sticky md:top-0 md:z-10`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/series" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                ← Séries
              </Link>
              <SeriesStatusBadge status={status} />
              <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <ChannelColorDot color={channel?.color ?? null} />
                {channel?.name ?? "Canal"}
              </span>
              {showOwner ? <span className="text-xs text-slate-500 dark:text-slate-400">Dono: {ownerLabel(series.owner_id)}</span> : null}
            </div>
            <h1 className="truncate text-2xl font-semibold text-slate-900 dark:text-slate-50">{series.title || "Série sem título"}</h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {series.progress.published + series.progress.scheduled + series.progress.approved}/{EPISODE_COUNT} aprovados · {series.progress.published} publicados ·
              Custo {spent != null ? formatUsd(spent) : "—"}
              {series.budget_limit_usd != null ? ` / ${formatUsd(series.budget_limit_usd)}` : " (sem limite)"}
            </p>
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {actions.map((a) => (
              <button key={a.key} type="button" onClick={a.onClick} disabled={a.busy} className={btnClass(a.variant)}>
                {a.label}
              </button>
            ))}
          </div>
          {actions.length > 0 ? (
            <button type="button" onClick={() => setMobileActions(true)} className={`${secondaryButton} md:hidden`}>
              Ações
            </button>
          ) : null}
        </div>
      </header>

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
      {res.error ? <LoadError message={res.error} onRetry={res.reload} /> : null}

      {status === "paused" && series.pause_reason ? (
        <Notice tone="warning" role="status">
          <strong>{PAUSE_REASON_LABELS[series.pause_reason]}.</strong> {PAUSE_REASON_HINTS[series.pause_reason]}
        </Notice>
      ) : null}

      {status === "planning" ? (
        <div className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`} role="status">
          <span className="text-indigo-600 dark:text-indigo-400">
            <Spinner />
          </span>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            A IA está lendo sua premissa e planejando a temporada. Costuma levar alguns minutos.
          </p>
        </div>
      ) : status === "plan_failed" ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-400 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">O planejamento da série falhou.</p>
          {series.error ? <p className="whitespace-pre-wrap">{series.error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setDialog("replan")} className={primaryButton}>
              Replanejar
            </button>
            <button type="button" onClick={() => setDialog("delete")} className={dangerButton}>
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <>
          {status === "planned" ? (
            <Notice
              tone="info"
              action={
                <button type="button" onClick={() => setDialog("start")} className={primaryButton}>
                  Iniciar série
                </button>
              }
            >
              O plano está pronto. Revise a bíblia e os episódios; quando estiver satisfeito, inicie a série.
            </Notice>
          ) : null}

          <TabBar tab={tab} onChange={setTab} attention={attentionEpisodes} />

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="outline-none">
            {tab === "geral" ? (
              <OverviewTab series={series} onOpenEpisode={openEp} onEditSettings={() => setDialog("settings")} />
            ) : tab === "biblia" ? (
              <BibleTab series={series} onChanged={res.reload} onOpenEpisode={openEp} />
            ) : tab === "episodios" ? (
              <EpisodesTab series={series} onOpenEpisode={openEp} />
            ) : (
              <CostsTab series={series} onEditBudget={() => setDialog("settings")} />
            )}
          </div>
        </>
      )}

      {openEpisode !== null && series.episodes.length > 0 ? (
        <EpisodeDrawer
          series={series}
          number={openEpisode}
          onClose={closeEp}
          onNavigate={switchEp}
          onChanged={res.reload}
          onEditBudget={() => setDialog("settings")}
        />
      ) : null}

      <Dialog open={mobileActions} onClose={() => setMobileActions(false)} title="Ações da série">
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.busy}
              onClick={() => {
                setMobileActions(false);
                a.onClick();
              }}
              className={`${btnClass(a.variant)} min-h-[44px]`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </Dialog>

      {dialog === "start" ? <StartDialog series={series} onClose={() => setDialog(null)} onDone={res.reload} /> : null}
      {dialog === "cancel" ? <CancelDialog series={series} onClose={() => setDialog(null)} onDone={res.reload} /> : null}
      {dialog === "delete" ? <DeleteDialog series={series} onClose={() => setDialog(null)} /> : null}
      {dialog === "replan" ? <ReplanDialog series={series} onClose={() => setDialog(null)} onDone={res.reload} /> : null}
      {dialog === "settings" ? <SeriesSettingsDialog series={series} onClose={() => setDialog(null)} onDone={res.reload} /> : null}
    </div>
  );
}

function TabBar({ tab, onChange, attention }: { tab: TabId; onChange: (t: TabId) => void; attention: number }) {
  function onKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    onChange(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  }
  return (
    <div role="tablist" aria-label="Seções da série" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {TABS.map((t) => {
        const selected = t.id === tab;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              selected
                ? "border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
            {t.id === "episodios" && attention > 0 ? <span className="ml-1 text-amber-700 dark:text-amber-300">({attention})</span> : null}
          </button>
        );
      })}
    </div>
  );
}
