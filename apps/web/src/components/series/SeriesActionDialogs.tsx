"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/format";
import { PRIVACY_OPTIONS, seriesApi, type Series, type SeriesUpdateInput, type VisualStrategy } from "@/lib/series";
import { seriesErrorMessage } from "@/lib/series-errors";
import { useProviders } from "@/lib/use-providers";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import {
  Field,
  Notice,
  dangerButton,
  hintClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "@/components/series/common";

export type SeriesDialogKind = "start" | "cancel" | "delete" | "replan" | "settings";

type CommonProps = { series: Series; onClose: () => void };

function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function StartDialog({ series, onClose, onDone }: CommonProps & { onDone: () => Promise<void> | void }) {
  const { showToast } = useToast();
  const min = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + series.lead_days);
    return toIsoDate(d);
  }, [series.lead_days]);
  const [date, setDate] = useState(min);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();

  const label = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  async function confirm() {
    if (date < min) {
      setError(`A data mínima é ${new Date(`${min}T12:00:00`).toLocaleDateString("pt-BR")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await seriesApi.start(series.id, date);
      showToast("Série iniciada. A IA começa a preparar os primeiros episódios.", "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível iniciar a série."));
      setErrorCode((err as { code?: string }).code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Iniciar série">
      <div className="flex flex-col gap-4">
        {error ? (
          <Notice tone="danger">
            {error}
            {errorCode === "channel_without_accounts" ? (
              <>
                {" "}
                <a href="/cortes/contas" className="font-medium underline">
                  Ir para Contas
                </a>
              </>
            ) : null}
          </Notice>
        ) : null}
        <Field id="start-date" label="Data do primeiro episódio" hint={`Mínimo: hoje + ${series.lead_days} dia(s) de antecedência.`}>
          <input id="start-date" type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} aria-describedby="start-date-hint" />
        </Field>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Ep. 1 vai ao ar em {label} às {series.publish_time}; a IA começa a preparar agora.
        </p>
        {series.estimated_cost ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Estimativa da temporada: <strong>{formatUsd(series.estimated_cost.season_usd)}</strong> ({formatUsd(series.estimated_cost.per_episode_usd)} por episódio).
            Você só gasta com mídia depois de aprovar cada roteiro{series.require_script_approval ? "" : " (a aprovação de roteiro está desligada nesta série)"}.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={primaryButton}>
            {busy ? "Iniciando…" : "Iniciar série"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function CancelDialog({ series, onClose, onDone }: CommonProps & { onDone: () => Promise<void> | void }) {
  const { showToast } = useToast();
  const [alsoPublications, setAlsoPublications] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await seriesApi.cancel(series.id, alsoPublications);
      showToast("Série cancelada.", "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível cancelar a série."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Cancelar série">
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="text-sm text-slate-700 dark:text-slate-200">
          A série para de gerar novos episódios. Episódios publicados continuam no ar.
        </p>
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked={alsoPublications} onChange={(e) => setAlsoPublications(e.target.checked)} className="mt-0.5 h-4 w-4" />
          Cancelar também as publicações já agendadas
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={dangerButton}>
            {busy ? "Cancelando…" : "Cancelar série"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function DeleteDialog({ series, onClose }: CommonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await seriesApi.remove(series.id);
      showToast("Série excluída.", "success");
      router.replace("/series");
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível excluir a série."));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Excluir série">
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Excluir &ldquo;{series.title}&rdquo;? Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={dangerButton}>
            {busy ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function ReplanDialog({ series, onClose, onDone }: CommonProps & { onDone: () => Promise<void> | void }) {
  const { showToast } = useToast();
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await seriesApi.replan(series.id, instructions.trim());
      showToast("Replanejamento iniciado.", "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível replanejar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Replanejar série">
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field id="replan-instructions" label="Instruções (opcional)" hint="Ex.: menos personagens, final mais esperançoso. A premissa continua a mesma.">
          <textarea id="replan-instructions" rows={4} maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={inputClass} aria-describedby="replan-instructions-hint" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={primaryButton}>
            {busy ? "Enviando…" : "Replanejar"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function SeriesSettingsDialog({ series, onClose, onDone }: CommonProps & { onDone: () => Promise<void> | void }) {
  const { showToast } = useToast();
  const providers = useProviders().data;
  const [title, setTitle] = useState(series.title);
  const [time, setTime] = useState(series.publish_time.slice(0, 5));
  const [leadDays, setLeadDays] = useState<1 | 2>(series.lead_days === 1 ? 1 : 2);
  const [privacy, setPrivacy] = useState(series.privacy);
  const [budget, setBudget] = useState(series.budget_limit_usd != null ? String(series.budget_limit_usd) : "");
  const [regens, setRegens] = useState(String(series.max_regenerations_per_episode));
  const [strategy, setStrategy] = useState<VisualStrategy>(series.visual_strategy);
  const [maxVideo, setMaxVideo] = useState(String(series.max_video_scenes_per_episode));
  const [imageProvider, setImageProvider] = useState(series.image_provider ?? "");
  const [videoProvider, setVideoProvider] = useState(series.video_provider ?? "");
  const [requireApproval, setRequireApproval] = useState(series.require_script_approval);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = Number(regens);
    if (!Number.isInteger(r) || r < 0 || r > 10) return setError("O limite de regenerações deve ser de 0 a 10.");
    if (budget.trim() && (Number.isNaN(Number(budget)) || Number(budget) < 0)) return setError("Informe um orçamento válido em US$.");
    const body: SeriesUpdateInput = {};
    if (title.trim() && title.trim() !== series.title) body.title = title.trim();
    if (time !== series.publish_time.slice(0, 5)) body.publish_time = time;
    if (leadDays !== series.lead_days) body.lead_days = leadDays;
    if (privacy !== series.privacy) body.privacy = privacy;
    const nextBudget = budget.trim() ? Number(budget) : null;
    if (nextBudget !== series.budget_limit_usd) body.budget_limit_usd = nextBudget;
    if (r !== series.max_regenerations_per_episode) body.max_regenerations_per_episode = r;
    if (strategy !== series.visual_strategy) body.visual_strategy = strategy;
    if (strategy === "hybrid" && Number(maxVideo) !== series.max_video_scenes_per_episode) body.max_video_scenes_per_episode = Number(maxVideo);
    if (imageProvider && imageProvider !== series.image_provider) body.image_provider = imageProvider;
    if (strategy !== "economy" && videoProvider && videoProvider !== series.video_provider) body.video_provider = videoProvider;
    if (requireApproval !== series.require_script_approval) body.require_script_approval = requireApproval;
    if (Object.keys(body).length === 0) return onClose();
    setBusy(true);
    setError(null);
    try {
      await seriesApi.update(series.id, body);
      showToast("Configuração salva.", "success");
      await onDone();
      onClose();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível salvar a configuração."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Configuração da série" widthClassName="max-w-xl">
      <form onSubmit={save} className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex flex-col gap-1">
          <span className={labelClass}>
            Premissa (somente leitura)
          </span>
          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">{series.premise}</p>
          <p className={hintClass}>A premissa não pode ser editada.</p>
        </div>
        <Field id="set-title" label="Título">
          <input id="set-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="set-time" label="Horário de publicação">
            <input id="set-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </Field>
          <Field id="set-lead" label="Antecedência">
            <select id="set-lead" value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value) === 1 ? 1 : 2)} className={inputClass}>
              <option value={1}>1 dia</option>
              <option value={2}>2 dias</option>
            </select>
          </Field>
          <Field id="set-privacy" label="Privacidade">
            <select id="set-privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} className={inputClass}>
              {PRIVACY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="set-regens" label="Regenerações por episódio" hint="De 0 a 10.">
            <input id="set-regens" type="number" min={0} max={10} value={regens} onChange={(e) => setRegens(e.target.value)} className={inputClass} aria-describedby="set-regens-hint" />
          </Field>
          <Field id="set-budget" label="Orçamento (US$)" hint="Vazio = sem limite.">
            <input id="set-budget" type="number" min={0} step="0.5" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} aria-describedby="set-budget-hint" />
          </Field>
          <Field id="set-strategy" label="Estilo visual">
            <select id="set-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as VisualStrategy)} className={inputClass}>
              <option value="economy">Economia</option>
              <option value="hybrid">Híbrido</option>
              <option value="full_video">Vídeo completo</option>
            </select>
          </Field>
          {strategy === "hybrid" ? (
            <Field id="set-maxvideo" label="Cenas em vídeo por episódio">
              <input id="set-maxvideo" type="number" min={1} max={6} value={maxVideo} onChange={(e) => setMaxVideo(e.target.value)} className={inputClass} />
            </Field>
          ) : null}
          {providers ? (
            <Field id="set-image" label="Provedor de imagem">
              <select id="set-image" value={imageProvider} onChange={(e) => setImageProvider(e.target.value)} className={inputClass}>
                {providers.image.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.name}
                    {p.configured ? "" : " (não configurado)"}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {providers && strategy !== "economy" ? (
            <Field id="set-video" label="Provedor de vídeo">
              <select id="set-video" value={videoProvider} onChange={(e) => setVideoProvider(e.target.value)} className={inputClass}>
                <option value="">Selecione…</option>
                {providers.video.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.name}
                    {p.configured ? "" : " (não configurado)"}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} className="mt-0.5 h-4 w-4" />
          Exigir aprovação do roteiro antes de gerar mídia
        </label>
        <p className={hintClass}>Provedor e estilo valem só para episódios que ainda não começaram a gerar mídia.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
