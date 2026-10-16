"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { clipThumbnailUrl, clipVideoUrl } from "@/lib/clips";
import { PLATFORM_LABELS } from "@/lib/channels";
import { formatDateShort, formatDateTimeShort, formatUsd } from "@/lib/format";
import { publicationExportUrl } from "@/lib/publications";
import {
  CHARACTER_STATUS_LABELS,
  CHARACTER_STATUS_SYMBOLS,
  EPISODE_COUNT,
  MEDIA_JOB_KIND_LABELS,
  isEpisodeTransient,
  seriesApi,
  type EpisodeDetail,
  type EpisodeOutline,
  type EpisodeScript,
  type EpisodeStatus,
  type MediaJob,
  type RegenerateScope,
  type SeriesDetail,
} from "@/lib/series";
import { errorCode, seriesErrorMessage } from "@/lib/series-errors";
import { useProviders } from "@/lib/use-providers";
import { usePolling } from "@/lib/use-polling";
import { useResource } from "@/lib/use-resource";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { PublicationStatusBadge } from "@/components/ui/StatusBadges";
import { useToast } from "@/components/ui/Toast";
import { AiBadge, ArcPhaseChip, EpisodeStatusBadge, MediaJobStatusBadge } from "@/components/series/badges";
import { Field, LoadError, Notice, ProgressMeter, UnavailableNotice, cardClass, hintClass, inputClass, primaryButton, secondaryButton, successButton } from "@/components/series/common";
import { RegenerateDialog, RejectDialog, UnapproveDialog } from "@/components/series/EpisodeDialogs";
import { SceneCard, ScriptEditor, ScriptTotals } from "@/components/series/ScriptParts";
import { ValidationReportView, blockerCount } from "@/components/series/ValidationReportView";

const STEPS = ["Roteiro", "Aprovar roteiro", "Mídia", "Montagem", "Aprovar vídeo", "Agendado"];

function stepIndex(status: EpisodeStatus): number {
  switch (status) {
    case "awaiting_script_approval":
      return 1;
    case "generating_media":
      return 2;
    case "assembling":
      return 3;
    case "pending_review":
    case "rejected":
      return 4;
    case "approved":
    case "scheduled":
    case "published":
      return 5;
    case "canceled":
      return -1;
    default:
      return 0;
  }
}

const EDIT_SCRIPT_STATUSES: EpisodeStatus[] = ["awaiting_script_approval", "script_ready", "needs_attention"];
const HAS_VIDEO_STATUSES: EpisodeStatus[] = ["pending_review", "approved", "scheduled", "published", "rejected"];

function jobErrorText(error: string): string {
  if (/safety|moderation|content[_ ]policy|blocked|policy violation/i.test(error)) {
    return "O provedor recusou a cena por segurança. Edite o prompt visual da cena.";
  }
  return error;
}

type Banner = { code?: string; message: string };

export function EpisodeDrawer({
  series,
  number,
  onClose,
  onNavigate,
  onChanged,
  onEditBudget,
}: {
  series: SeriesDetail;
  number: number;
  onClose: () => void;
  onNavigate: (n: number) => void;
  onChanged: () => Promise<void> | void;
  onEditBudget: () => void;
}) {
  const { showToast } = useToast();
  const summary = series.episodes.find((e) => e.number === number) ?? null;
  const res = useResource<EpisodeDetail>((signal) => seriesApi.episode(series.id, number, signal), `${series.id}:${number}`, {
    errorFallback: "Não foi possível carregar o episódio.",
  });
  const detail = res.data;
  const status: EpisodeStatus | undefined = detail?.status ?? summary?.status;
  const providers = useProviders().data;

  const polling = usePolling(res.reload, { active: !!status && isEpisodeTransient(status), resetKey: `${number}|${status}` });

  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dialog, setDialog] = useState<"regen" | "reject" | "unapprove" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EpisodeScript | null>(null);
  const [outlineDraft, setOutlineDraft] = useState<{ summary: string; events: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const sceneRefs = useRef<(HTMLLIElement | null)[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);

  // Leaving the episode (or a status change driven by the server) drops stale edit state.
  useEffect(() => {
    setDraft(null);
    setOutlineDraft(null);
    setBanner(null);
    setConflict(false);
  }, [number]);

  const perEpisode = series.estimated_cost?.per_episode_usd ?? null;
  const blockers = blockerCount(detail?.validation ?? null);
  const locked = busy !== null;

  async function refresh() {
    await Promise.all([res.reload(), onChanged()]);
  }

  async function run(kind: string, fn: () => Promise<unknown>, successMessage?: string | (() => string)): Promise<boolean> {
    setBusy(kind);
    setBanner(null);
    try {
      await fn();
      await refresh();
      if (successMessage) showToast(typeof successMessage === "function" ? successMessage() : successMessage, "success");
      return true;
    } catch (err) {
      const code = errorCode(err);
      const message = seriesErrorMessage(err);
      if (code === "invalid_transition" || code === "episode_busy") {
        showToast(message, "error");
        void refresh();
      } else {
        setBanner({ code, message });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function approveScript() {
    await run("approve-script", () => seriesApi.approveScript(series.id, number), "Roteiro aprovado. A IA começou a gerar a mídia.");
  }

  async function approveVideo() {
    let result: EpisodeDetail | undefined;
    await run(
      "approve",
      async () => {
        result = (await seriesApi.approve(series.id, number)) as EpisodeDetail | undefined;
      },
      () =>
        result?.status === "approved"
          ? "Episódio aprovado, aguardando horário livre."
          : result?.scheduled_at
            ? `Episódio aprovado e agendado para ${formatDateTimeShort(result.scheduled_at, series.timezone).replace(" ", " às ")}.`
            : "Episódio aprovado.",
    );
  }

  async function regenerate(scope: RegenerateScope, instructions: string) {
    setBusy("regen");
    setDialogError(null);
    try {
      await seriesApi.regenerate(series.id, number, scope, instructions);
      setDialog(null);
      await refresh();
      showToast("Regeneração iniciada.", "success");
    } catch (err) {
      setDialogError(seriesErrorMessage(err));
      if (errorCode(err) === "invalid_transition") void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject(body: { instructions?: string; regenerate: boolean; scope?: RegenerateScope }) {
    setBusy("reject");
    setDialogError(null);
    try {
      await seriesApi.reject(series.id, number, body);
      setDialog(null);
      await refresh();
      showToast(body.regenerate ? "Episódio rejeitado. Regeneração iniciada." : "Episódio rejeitado.", "success");
    } catch (err) {
      setDialogError(seriesErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function unapprove() {
    setBusy("unapprove");
    setDialogError(null);
    try {
      await seriesApi.unapprove(series.id, number);
      setDialog(null);
      await refresh();
      showToast("Episódio desaprovado. Voltou para revisão.", "success");
    } catch (err) {
      const code = errorCode(err);
      setDialogError(
        code === "invalid_transition"
          ? "Não é possível desaprovar: o episódio já foi publicado ou o episódio seguinte está aprovado. Desaprove primeiro o episódio seguinte."
          : seriesErrorMessage(err),
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveScript() {
    if (!draft || !detail) return;
    setBusy("save-script");
    setBanner(null);
    try {
      await seriesApi.putScript(series.id, number, detail.script_revision, draft);
      setDraft(null);
      await refresh();
      showToast("Roteiro salvo. O episódio voltou para validação.", "success");
    } catch (err) {
      if (errorCode(err) === "script_revision_conflict") setConflict(true);
      else setBanner({ code: errorCode(err), message: seriesErrorMessage(err, "Não foi possível salvar o roteiro.") });
    } finally {
      setBusy(null);
    }
  }

  async function saveOutline() {
    if (!outlineDraft || !detail) return;
    const outline: EpisodeOutline = {
      ...(detail.outline ?? {}),
      summary: outlineDraft.summary,
      key_events: outlineDraft.events.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    const ok = await run("save-outline", () => seriesApi.putOutline(series.id, number, outline), "Sinopse salva.");
    if (ok) setOutlineDraft(null);
  }

  async function reloadAfterConflict() {
    setDraft(null);
    setConflict(false);
    await refresh();
  }

  function jumpToScene(position: number) {
    const el = draft ? editorRef.current?.querySelector<HTMLElement>(`[data-scene-position="${position}"]`) : sceneRefs.current[position];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  }

  const prevNext = (
    <div className="flex items-center gap-1" role="group" aria-label="Navegar entre episódios">
      <button type="button" onClick={() => onNavigate(number - 1)} disabled={number <= 1 || locked} aria-label="Episódio anterior" className="btn btn-secondary btn-sm">
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" onClick={() => onNavigate(number + 1)} disabled={number >= EPISODE_COUNT || locked} aria-label="Próximo episódio" className="btn btn-secondary btn-sm">
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );

  const title = `Ep. ${number} · ${detail?.title ?? summary?.title ?? ""}`;
  const editingScript = draft !== null;
  const canEditScript = !!status && EDIT_SCRIPT_STATUSES.includes(status) && !!detail?.script;
  const outlineEditable = status === "planned" || status === "stale";
  const characters = series.characters;
  const liveScenes = detail?.script?.scenes ?? [];

  return (
    <Dialog open onClose={onClose} title={title} variant="drawer" headerExtra={prevNext}>
      {res.unavailable ? (
        <UnavailableNotice onRetry={res.reload} />
      ) : !detail && res.error ? (
        <LoadError message={res.error} onRetry={res.reload} />
      ) : (
        <div className="flex flex-col gap-5 pb-4" aria-busy={res.loading}>
          <div className="flex flex-wrap items-center gap-2">
            {status ? <EpisodeStatusBadge status={status} /> : null}
            {(detail?.arc_phase ?? summary?.arc_phase) ? <ArcPhaseChip phase={(detail?.arc_phase ?? summary!.arc_phase)} /> : null}
            <span className="text-xs text-fg-muted">
              {detail?.scheduled_at ? `Publica ${formatDateTimeShort(detail.scheduled_at, series.timezone)}` : `Data ${formatDateShort(summary?.target_date)} ${series.publish_time.slice(0, 5)}`}
            </span>
            <span className="text-xs text-fg-muted">Custo {formatUsd(detail?.cost_usd ?? summary?.cost_usd ?? 0)}</span>
            <span className="text-xs text-fg-muted">
              Regenerações {detail?.regenerations ?? summary?.regenerations ?? 0}/{series.max_regenerations_per_episode}
            </span>
          </div>

          {status ? <Stepper status={status} /> : null}

          {polling.offline ? <Notice tone="warning" role="status">Sem conexão. Tentando de novo…</Notice> : null}
          {polling.stalled ? (
            <Notice tone="info" role="status" action={<button type="button" onClick={polling.refetch} className="text-sm font-medium underline">Atualizar</button>}>
              A atualização automática pausou.
            </Notice>
          ) : null}
          {res.error && detail ? <LoadError message={res.error} onRetry={res.reload} /> : null}

          {status ? (
            <StatusBanner status={status} number={number} series={series} perEpisode={perEpisode} detail={detail} blockers={blockers} />
          ) : null}

          {banner ? (
            <Notice
              tone="danger"
              action={
                banner.code === "previous_episode_not_approved" && number > 1 ? (
                  <button type="button" onClick={() => onNavigate(number - 1)} className={secondaryButton}>
                    Abrir Ep. {number - 1}
                  </button>
                ) : banner.code === "series_budget_exceeded" ? (
                  <button type="button" onClick={onEditBudget} className={secondaryButton}>
                    Editar orçamento
                  </button>
                ) : banner.code === "provider_not_configured" ? (
                  <Link href="/cortes/contas" className={secondaryButton}>
                    Ir para Contas
                  </Link>
                ) : undefined
              }
            >
              {banner.code === "previous_episode_not_approved" ? `Aprove o Ep. ${number - 1} antes. ` : ""}
              {banner.message}
            </Notice>
          ) : null}

          {!detail ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <section aria-labelledby="ep-outline" className={cardClass}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 id="ep-outline" className="text-sm font-semibold text-fg">
                    Sinopse
                  </h3>
                  {outlineEditable && !outlineDraft ? (
                    <button
                      type="button"
                      onClick={() => setOutlineDraft({ summary: detail.outline?.summary ?? "", events: (detail.outline?.key_events ?? []).join("\n") })}
                      className="text-sm font-medium text-primary-text hover:underline"
                    >
                      Editar sinopse
                    </button>
                  ) : null}
                </div>
                {outlineDraft ? (
                  <div className="flex flex-col gap-3">
                    <Field id="outline-summary" label="Resumo">
                      <textarea id="outline-summary" rows={4} maxLength={400} value={outlineDraft.summary} onChange={(e) => setOutlineDraft({ ...outlineDraft, summary: e.target.value })} className={inputClass} />
                    </Field>
                    <Field id="outline-events" label="Eventos-chave (um por linha)">
                      <textarea id="outline-events" rows={4} value={outlineDraft.events} onChange={(e) => setOutlineDraft({ ...outlineDraft, events: e.target.value })} className={inputClass} />
                    </Field>
                    <div className="flex gap-2">
                      <button type="button" onClick={saveOutline} disabled={locked} className={primaryButton}>
                        {busy === "save-outline" ? "Salvando…" : "Salvar sinopse"}
                      </button>
                      <button type="button" onClick={() => setOutlineDraft(null)} disabled={locked} className={secondaryButton}>
                        Descartar
                      </button>
                    </div>
                  </div>
                ) : detail.outline ? (
                  <OutlineView outline={detail.outline} series={series} />
                ) : (
                  <p className="text-sm text-fg-muted">Sem sinopse.</p>
                )}
              </section>

              {detail.script || detail.validation ? (
                <section aria-labelledby="ep-validation" className={cardClass}>
                  <h3 id="ep-validation" className="mb-2 text-sm font-semibold text-fg">
                    Validação
                  </h3>
                  <ValidationReportView validation={detail.validation} attempts={detail.validation_attempts} script={detail.script} onJumpToScene={jumpToScene} />
                </section>
              ) : null}

              {detail.script ? (
                <section aria-labelledby="ep-script" className={cardClass}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 id="ep-script" className="text-sm font-semibold text-fg">
                      Roteiro (revisão {detail.script_revision})
                    </h3>
                    {canEditScript && !editingScript ? (
                      <button type="button" onClick={() => setDraft(JSON.parse(JSON.stringify(detail.script)) as EpisodeScript)} disabled={locked} className="text-sm font-medium text-primary-text hover:underline">
                        Editar roteiro
                      </button>
                    ) : null}
                  </div>
                  {status && ["generating_media", "assembling", "published"].includes(status) ? (
                    <p className={`mb-2 ${hintClass}`}>
                      {status === "published" ? "Episódio publicado: o roteiro não pode mais ser alterado." : "Aguarde a geração terminar para editar o roteiro."}
                    </p>
                  ) : null}
                  {conflict ? (
                    <div className="mb-3">
                      <Notice tone="danger" action={<button type="button" onClick={reloadAfterConflict} className={secondaryButton}>Recarregar</button>}>
                        O roteiro mudou enquanto você editava. Recarregue para continuar; suas edições não foram salvas.
                      </Notice>
                    </div>
                  ) : null}
                  {editingScript && draft ? (
                    <div ref={editorRef} className="flex flex-col gap-3">
                      <ScriptEditor script={draft} series={series} providers={providers} onChange={setDraft} />
                      <p className={hintClass}>Salvar volta o episódio para validação e invalida mídia já gerada.</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveScript} disabled={locked || conflict} className={primaryButton}>
                          {busy === "save-script" ? "Salvando…" : "Salvar e validar"}
                        </button>
                        <button type="button" onClick={() => { setDraft(null); setConflict(false); }} disabled={locked} className={secondaryButton}>
                          Descartar edição
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <ScriptTotals script={detail.script} />
                      <ol className="flex flex-col gap-3">
                        {liveScenes.map((scene, i) => (
                          <SceneCard key={scene.index} ref={(el) => { sceneRefs.current[i] = el; }} scene={scene} position={i} characters={characters} bible={series.bible} />
                        ))}
                      </ol>
                      {detail.script.cliffhanger ? (
                        <p className="text-sm text-fg-muted">
                          <span className="font-medium">Cliffhanger:</span> {detail.script.cliffhanger}
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}

              {detail.state_events.length > 0 ? (
                <section aria-labelledby="ep-events" className={cardClass}>
                  <h3 id="ep-events" className="mb-2 text-sm font-semibold text-fg">
                    Eventos de estado propostos
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {detail.state_events.map((ev) => {
                      const c = characters.find((x) => x.key === ev.character_key);
                      const kills = ev.to_status === "dead";
                      return (
                        <li key={ev.id} className={`rounded-lg border p-2 text-sm ${kills ? "border-warning/40 bg-warning-soft text-fg" : "border-border"}`}>
                          <span aria-hidden="true">{ev.to_status ? CHARACTER_STATUS_SYMBOLS[ev.to_status] : ""} </span>
                          <span className="text-fg">
                            {ev.type === "introduce"
                              ? `${c?.name ?? ev.character_key}: introduzido`
                              : `${c?.name ?? ev.character_key}: ${ev.from_status ? CHARACTER_STATUS_LABELS[ev.from_status].toLowerCase() : "—"} → ${ev.to_status ? CHARACTER_STATUS_LABELS[ev.to_status].toLowerCase() : "—"}`}
                            {ev.state === "proposed" ? " (proposto)" : ev.state === "applied" ? " (aplicado)" : ""}
                          </span>
                          {ev.description ? <span className="block text-xs text-fg-muted">{ev.description}</span> : null}
                          {kills && ev.state !== "applied" ? <span className="block text-xs font-medium text-amber-800 dark:text-amber-200">Esta cena mata um personagem. Só entra em vigor ao aprovar o vídeo.</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <section aria-labelledby="ep-video" className="flex flex-col gap-2">
                  <h3 id="ep-video" className="text-sm font-semibold text-fg">
                    Vídeo
                  </h3>
                  <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-lg bg-black">
                    {detail.clip_id && status && HAS_VIDEO_STATUSES.includes(status) ? (
                      <>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- narration is burned in/not subtitled by the generator */}
                        <video key={detail.clip_id} controls playsInline preload="metadata" poster={clipThumbnailUrl(detail.clip_id)} src={clipVideoUrl(detail.clip_id)} className="h-full w-full" />
                        <span className="pointer-events-none absolute left-2 top-2">
                          <AiBadge label="Conteúdo gerado por IA" />
                        </span>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-400">O vídeo aparece aqui quando a montagem terminar.</div>
                    )}
                  </div>
                  {detail.clip_id && status && HAS_VIDEO_STATUSES.includes(status) ? (
                    <Link href="/cortes/revisao" className="text-center text-xs font-medium text-primary-text hover:underline">
                      Ver metadados
                    </Link>
                  ) : null}
                </section>

                <section aria-labelledby="ep-jobs" className="flex min-w-0 flex-col gap-2">
                  <h3 id="ep-jobs" className="text-sm font-semibold text-fg">
                    Jobs de mídia
                  </h3>
                  <MediaJobsTable jobs={detail.media_jobs} generating={status === "generating_media"} />
                </section>
              </div>

              {detail.publications.length > 0 ? (
                <section aria-labelledby="ep-pubs" className={cardClass}>
                  <h3 id="ep-pubs" className="mb-2 text-sm font-semibold text-fg">
                    Publicações
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {detail.publications.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <PublicationStatusBadge status={p.status} />
                        <span className="text-fg">{PLATFORM_LABELS[p.platform] ?? p.platform}</span>
                        <span className="text-xs text-fg-muted">{formatDateTimeShort(p.published_at ?? p.scheduled_at, series.timezone)}</span>
                        <AiBadge />
                        {p.status === "exported" ? (
                          <a href={publicationExportUrl(p.id)} className="text-xs font-medium text-primary-text hover:underline">
                            Baixar pacote de exportação
                          </a>
                        ) : null}
                        {p.external_url ? (
                          <a href={p.external_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary-text hover:underline">
                            Abrir
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      )}

      {detail && status ? (
        <ActionBar
          status={status}
          busy={busy}
          editing={editingScript || outlineDraft !== null}
          blockers={blockers}
          perEpisode={perEpisode}
          onApproveScript={approveScript}
          onApprove={approveVideo}
          onRegenerate={() => { setDialogError(null); setDialog("regen"); }}
          onReject={() => { setDialogError(null); setDialog("reject"); }}
          onUnapprove={() => { setDialogError(null); setDialog("unapprove"); }}
          onRewrite={() => run("rewrite", () => seriesApi.regenerate(series.id, number, "script"), "Reescrita iniciada.")}
          onEditScript={canEditScript ? () => setDraft(JSON.parse(JSON.stringify(detail.script)) as EpisodeScript) : undefined}
        />
      ) : null}

      {dialog === "regen" ? (
        <RegenerateDialog
          used={detail?.regenerations ?? summary?.regenerations ?? 0}
          limit={series.max_regenerations_per_episode}
          mediaCost={perEpisode}
          defaultScope={status === "needs_attention" || status === "stale" ? "script" : "media"}
          busy={busy === "regen"}
          error={dialogError}
          onClose={() => setDialog(null)}
          onConfirm={regenerate}
        />
      ) : null}
      {dialog === "reject" ? <RejectDialog mediaCost={perEpisode} busy={busy === "reject"} error={dialogError} onClose={() => setDialog(null)} onConfirm={reject} /> : null}
      {dialog === "unapprove" ? <UnapproveDialog number={number} busy={busy === "unapprove"} error={dialogError} onClose={() => setDialog(null)} onConfirm={unapprove} /> : null}
    </Dialog>
  );
}

function Stepper({ status }: { status: EpisodeStatus }) {
  const current = stepIndex(status);
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-1 text-xs" aria-label="Etapas do episódio">
      {STEPS.map((label, i) => {
        const done = current > i || (current === 5 && i === 5);
        const isCurrent = current === i;
        return (
          <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex items-center gap-1">
            <span
              className={`rounded-full border px-2 py-0.5 font-medium ${
                isCurrent
                  ? "border-indigo-500 bg-primary text-white"
                  : done
                    ? "border-success/40 bg-success-soft text-fg"
                    : "border-border-strong text-fg-muted"
              }`}
            >
              {done && !isCurrent ? <span aria-hidden="true">✓ </span> : null}
              {i === 5 && status === "published" ? "Publicado" : label}
            </span>
            {i < STEPS.length - 1 ? <span aria-hidden="true" className="text-fg-subtle">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function StatusBanner({
  status,
  number,
  series,
  perEpisode,
  detail,
  blockers,
}: {
  status: EpisodeStatus;
  number: number;
  series: SeriesDetail;
  perEpisode: number | null;
  detail: EpisodeDetail | null;
  blockers: number;
}) {
  const cost = perEpisode != null ? ` (custo estimado: ${formatUsd(perEpisode)})` : "";
  let tone: "info" | "warning" | "danger" | "success" = "info";
  let text: React.ReactNode = null;
  switch (status) {
    case "planned":
      text = "Ainda não escrito.";
      break;
    case "stale":
      tone = "warning";
      text = "Desatualizado: a bíblia ou o episódio anterior mudou. Será reescrito.";
      break;
    case "scripting":
      text = "A IA está escrevendo o roteiro.";
      break;
    case "validating":
      text = "A IA está validando o roteiro.";
      break;
    case "script_ready":
      text = "Roteiro pronto, aguardando próxima etapa.";
      break;
    case "awaiting_script_approval":
      tone = "warning";
      text = (
        <>
          Revise o roteiro. Ao aprovar, a IA gera imagens, vídeo e voz{cost}.
          {blockers > 0 ? <strong> Resolva {blockers} {blockers === 1 ? "bloqueio" : "bloqueios"}: edite o roteiro ou regenere.</strong> : null}
        </>
      );
      break;
    case "generating_media":
    case "assembling":
      text = status === "assembling" ? "Montando o vídeo final…" : "Gerando mídia…";
      break;
    case "pending_review":
      tone = "warning";
      text = "Revise o vídeo. Ao aprovar, ele é agendado e os eventos de personagem entram em vigor.";
      break;
    case "approved":
      tone = "success";
      text = "Aprovado, mas sem horário livre. O sistema tenta de novo automaticamente.";
      break;
    case "scheduled":
      tone = "success";
      text = `Agendado para ${formatDateTimeShort(detail?.scheduled_at ?? null, series.timezone).replace(" ", " às ")}.`;
      break;
    case "published":
      tone = "success";
      text = "Publicado.";
      break;
    case "rejected":
      tone = "danger";
      text = <>Rejeitado.{detail?.user_instructions ? ` Instruções usadas: ${detail.user_instructions}` : ""}</>;
      break;
    case "needs_attention":
      tone = "danger";
      text = (
        <>
          <strong>Precisa de atenção.</strong> {detail?.error ?? "Ocorreu um erro neste episódio."}
        </>
      );
      break;
    case "canceled":
      text = `O Ep. ${number} foi cancelado.`;
      break;
  }
  return (
    <Notice tone={tone} role={status === "needs_attention" ? "alert" : "status"}>
      {text}
    </Notice>
  );
}

function ActionBar({
  status,
  busy,
  editing,
  blockers,
  perEpisode,
  onApproveScript,
  onApprove,
  onRegenerate,
  onReject,
  onUnapprove,
  onRewrite,
  onEditScript,
}: {
  status: EpisodeStatus;
  busy: string | null;
  editing: boolean;
  blockers: number;
  perEpisode: number | null;
  onApproveScript: () => void;
  onApprove: () => void;
  onRegenerate: () => void;
  onReject: () => void;
  onUnapprove: () => void;
  onRewrite: () => void;
  onEditScript?: () => void;
}) {
  const locked = busy !== null;
  const disabledPrimary = locked || blockers > 0;
  const help: string[] = [];
  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];

  const btn = (key: string, label: string, onClick: () => void, cls = secondaryButton, disabled = locked) => (
    <button key={key} type="button" onClick={onClick} disabled={disabled} aria-busy={busy === key} className={`${cls} min-h-[44px] md:min-h-0`}>
      {label}
    </button>
  );

  switch (status) {
    case "stale":
      primary = btn("rewrite", busy === "rewrite" ? "Reescrevendo…" : "Reescrever agora", onRewrite, primaryButton);
      break;
    case "awaiting_script_approval":
      help.push(`Aprovar o roteiro libera o gasto com mídia${perEpisode != null ? ` (até ${formatUsd(perEpisode)})` : ""}.`);
      primary = (
        <button
          key="approve-script"
          type="button"
          onClick={() => !disabledPrimary && onApproveScript()}
          aria-disabled={disabledPrimary}
          aria-busy={busy === "approve-script"}
          className={`${primaryButton} min-h-[44px] md:min-h-0`}
        >
          {busy === "approve-script" ? "Aprovando…" : "Aprovar roteiro (gera mídia)"}
        </button>
      );
      if (blockers > 0) help.push(`Resolva ${blockers} ${blockers === 1 ? "bloqueio" : "bloqueios"}: edite o roteiro ou regenere.`);
      secondary.push(btn("regen", "Regenerar…", onRegenerate));
      if (onEditScript) secondary.push(btn("edit", "Editar roteiro", onEditScript));
      break;
    case "script_ready":
      if (onEditScript) secondary.push(btn("edit", "Editar roteiro", onEditScript));
      break;
    case "pending_review":
      help.push("Aprovar o vídeo libera a publicação.");
      primary = btn("approve", busy === "approve" ? "Aprovando…" : "Aprovar vídeo", onApprove, successButton);
      secondary.push(btn("reject", "Rejeitar…", onReject));
      secondary.push(btn("regen", "Regenerar…", onRegenerate));
      break;
    case "approved":
    case "scheduled":
      secondary.push(btn("unapprove", "Desaprovar…", onUnapprove));
      break;
    case "rejected":
      primary = btn("regen", "Regenerar…", onRegenerate, primaryButton);
      break;
    case "needs_attention":
      primary = btn("regen", "Regenerar…", onRegenerate, primaryButton);
      if (onEditScript) secondary.push(btn("edit", "Editar roteiro", onEditScript));
      break;
    default:
      break;
  }

  if (!primary && secondary.length === 0) return null;
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 flex flex-col gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
      {editing ? <p className={hintClass}>Salve ou descarte a edição em andamento antes de usar as ações do episódio.</p> : null}
      {help.map((h, i) => (
        <p key={i} className={hintClass} id={i === 0 ? "ep-action-help" : undefined}>
          {h}
        </p>
      ))}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row">{secondary}</div>
        {primary ? <div className="flex flex-col">{primary}</div> : null}
      </div>
    </div>
  );
}

function OutlineView({ outline, series }: { outline: EpisodeOutline; series: SeriesDetail }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-fg">
      {outline.summary ? <p>{outline.summary}</p> : null}
      {outline.key_events && outline.key_events.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase text-fg-subtle">Eventos-chave</p>
          <ul className="list-inside list-disc">
            {outline.key_events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {outline.planned_state_changes && outline.planned_state_changes.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase text-fg-subtle">Mudanças planejadas</p>
          <ul className="list-inside list-disc">
            {outline.planned_state_changes.map((c, i) => (
              <li key={i}>
                {series.characters.find((x) => x.key === c.character_key)?.name ?? c.character_key} → {CHARACTER_STATUS_LABELS[c.to_status]?.toLowerCase() ?? c.to_status}
                {c.note ? ` (${c.note})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {outline.cliffhanger ? (
        <p>
          <span className="font-medium">Cliffhanger:</span> {outline.cliffhanger}
        </p>
      ) : null}
    </div>
  );
}

function MediaJobsTable({ jobs, generating }: { jobs: MediaJob[]; generating: boolean }) {
  const done = jobs.filter((j) => j.status === "succeeded").length;
  const sorted = useMemo(() => [...jobs].sort((a, b) => (a.scene_index ?? -1) - (b.scene_index ?? -1)), [jobs]);
  if (jobs.length === 0) return <p className="text-sm text-fg-muted">Nenhum job de mídia ainda.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        {done} de {jobs.length} prontos
      </p>
      {generating ? <ProgressMeter value={done} max={jobs.length} label="Progresso dos jobs de mídia" /> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <caption className="sr-only">Jobs de geração de mídia do episódio</caption>
          <thead>
            <tr className="text-left uppercase text-fg-subtle">
              {["Tipo", "Provedor", "Status", "Tent.", "Duração", "Custo", "Erro"].map((h) => (
                <th key={h} scope="col" className="py-1 pr-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((j) => (
              <tr key={j.id} className="align-top">
                <td className="py-1 pr-3 text-fg">
                  {MEDIA_JOB_KIND_LABELS[j.kind] ?? j.kind}
                  {j.scene_index != null ? ` · cena ${j.scene_index + 1}` : ""}
                </td>
                <td className="py-1 pr-3 text-fg-muted">{j.provider}</td>
                <td className="py-1 pr-3">
                  <MediaJobStatusBadge status={j.status} />
                </td>
                <td className="py-1 pr-3 text-fg-muted">{j.attempts}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-fg-muted">{j.duration_s != null ? `${j.duration_s} s` : "—"}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-fg-muted">
                  {j.cost_usd_actual != null
                    ? j.cost_usd_estimated != null
                      ? `${formatUsd(j.cost_usd_estimated)} → ${formatUsd(j.cost_usd_actual)}`
                      : formatUsd(j.cost_usd_actual)
                    : formatUsd(j.cost_usd_estimated)}
                </td>
                <td className="py-1 text-danger">
                  {j.error ? (
                    <details role={j.status === "failed" ? "alert" : undefined}>
                      <summary className="max-w-[16rem] cursor-pointer truncate">{jobErrorText(j.error)}</summary>
                      <p className="mt-1 whitespace-pre-wrap">{jobErrorText(j.error)}</p>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
