"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { formatUsd } from "@/lib/format";
import { getMyUsage, type UsageRead } from "@/lib/me";
import { PLATFORM_LABELS, type PlatformValue } from "@/lib/channels";
import {
  MAX_PREMISE_LENGTH,
  MIN_PREMISE_LENGTH,
  PRIVACY_OPTIONS,
  TIMEZONES,
  seriesApi,
  type ProvidersResponse,
  type SeriesCreateInput,
} from "@/lib/series";
import { seriesErrorMessage } from "@/lib/series-errors";
import { useProviders } from "@/lib/use-providers";
import { useAuth } from "@/lib/user-context";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { StrategyStep, useStrategyEstimates } from "@/components/series/CostEstimate";
import { ProviderStep } from "@/components/series/ProviderStep";
import {
  Field,
  LoadError,
  Notice,
  UnavailableNotice,
  hintClass,
  inputClass,
  labelClass,
  linkClass,
  primaryButton,
  secondaryButton,
} from "@/components/series/common";
import {
  ATTESTATION_TEXT,
  FIELD_STEP,
  GENRES,
  INITIAL_WIZARD_STATE,
  OTHER,
  STEP_TITLES,
  TONES,
  effectiveGenre,
  effectiveTone,
  type FieldErrors,
  type WizardState,
} from "@/components/series/wizard-state";

function pickDefault(items: { id: string; configured: boolean; fake: boolean }[]): string {
  return (items.find((p) => p.configured && !p.fake) ?? items.find((p) => p.configured))?.id ?? "";
}

function reducer(state: WizardState, patch: Partial<WizardState>): WizardState {
  return { ...state, ...patch };
}

export function SeriesWizard() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { channels, selectedChannelId, loading: channelsLoading } = useChannelContext();
  const providersRes = useProviders();
  const providers = providersRes.data;

  const [state, patchState] = useReducer(reducer, INITIAL_WIZARD_STATE);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<{ code?: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [usage, setUsage] = useState<UsageRead | null>(null);
  const submittedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function change(patch: Partial<WizardState>) {
    patchState(patch);
    setDirty(true);
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  // Preselect the channel from the global picker and default providers once they load.
  useEffect(() => {
    if (!state.channelId) {
      const initial = selectedChannelId || (channels.length === 1 ? channels[0].id : "");
      if (initial) patchState({ channelId: initial });
    }
  }, [selectedChannelId, channels, state.channelId]);

  useEffect(() => {
    if (!providers) return;
    patchState({
      imageProvider: state.imageProvider || pickDefault(providers.image),
      videoProvider: state.videoProvider || pickDefault(providers.video),
      ttsProvider: state.ttsProvider || pickDefault(providers.tts),
    });
    // only fill blanks once, when the catalog arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  useEffect(() => {
    if (user && !user.is_admin) {
      getMyUsage().then(setUsage).catch(() => undefined);
    }
  }, [user]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const estimates = useStrategyEstimates(state, step >= 2);
  const currentEstimate = estimates[state.strategy].data;
  const channel = channels.find((c) => c.id === state.channelId) ?? null;

  function validate(forStep: number): FieldErrors {
    const e: FieldErrors = {};
    if (forStep === 1) {
      if (state.title.length > 120) e.title = "O título pode ter no máximo 120 caracteres.";
      const len = state.premise.trim().length;
      if (len < MIN_PREMISE_LENGTH) e.premise = `A premissa precisa de pelo menos ${MIN_PREMISE_LENGTH} caracteres (faltam ${MIN_PREMISE_LENGTH - len}).`;
      if (state.premise.length > MAX_PREMISE_LENGTH) e.premise = `A premissa pode ter no máximo ${MAX_PREMISE_LENGTH} caracteres.`;
      if (!effectiveGenre(state)) e.genre = "Informe o gênero.";
      if (!effectiveTone(state)) e.tone = "Informe o tom.";
      if (!state.channelId) e.channel_id = "Escolha um canal.";
    }
    if (forStep === 2 && state.strategy === "hybrid") {
      const n = Number(state.maxVideoScenes);
      if (!Number.isInteger(n) || n < 1 || n > 6) e.max_video_scenes_per_episode = "Use um número de 1 a 6.";
    }
    if (forStep === 3 && providers) {
      const img = providers.image.find((p) => p.id === state.imageProvider);
      if (!img) e.image_provider = "Escolha o provedor de imagem.";
      else if (!img.configured) e.image_provider = "Este provedor não está configurado.";
      if (state.strategy !== "economy") {
        const vid = providers.video.find((p) => p.id === state.videoProvider);
        if (!vid) e.video_provider = "Escolha o provedor de vídeo ou volte e use Economia.";
        else if (!vid.configured) e.video_provider = "Este provedor não está configurado.";
      }
      const tts = providers.tts.find((p) => p.id === state.ttsProvider);
      if (!tts) e.tts_provider = "Escolha o provedor de narração.";
      else if (!tts.configured) e.tts_provider = "Este provedor não está configurado.";
      else if (!state.ttsVoiceId) e.tts_voice_id = "Escolha uma voz.";
    }
    if (forStep === 4) {
      if (!/^\d{2}:\d{2}$/.test(state.publishTime)) e.publish_time = "Informe o horário de publicação.";
      const r = Number(state.maxRegens);
      if (!Number.isInteger(r) || r < 0 || r > 10) e.max_regenerations_per_episode = "Use um número de 0 a 10.";
      if (state.budget.trim() && (Number.isNaN(Number(state.budget)) || Number(state.budget) < 0)) e.budget_limit_usd = "Informe um valor em US$ maior ou igual a zero.";
    }
    return e;
  }

  function focusFirstError(e: FieldErrors) {
    const first = Object.keys(e)[0];
    if (!first) return;
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] select, [data-field="${first}"]`);
      el?.focus();
    }, 0);
  }

  function goNext() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      focusFirstError(e);
      return;
    }
    setBanner(null);
    setStep((s) => Math.min(5, s + 1));
  }

  function buildPayload(): SeriesCreateInput {
    const budget = state.budget.trim();
    return {
      title: state.title.trim() || undefined,
      premise: state.premise.trim(),
      genre: effectiveGenre(state),
      tone: effectiveTone(state),
      channel_id: state.channelId,
      visual_strategy: state.strategy,
      max_video_scenes_per_episode: state.strategy === "hybrid" ? Number(state.maxVideoScenes) : 1,
      video_provider: state.strategy === "economy" ? null : state.videoProvider || null,
      image_provider: state.imageProvider,
      tts_provider: state.ttsProvider,
      tts_voice_id: state.ttsVoiceId,
      publish_time: state.publishTime,
      timezone: state.timezone,
      lead_days: state.leadDays,
      privacy: state.privacy,
      budget_limit_usd: budget ? Number(budget) : null,
      max_regenerations_per_episode: Number(state.maxRegens),
      require_script_approval: state.requireScriptApproval,
      monetization_allowed: state.monetization,
      originality_attestation: true,
    };
  }

  async function submit() {
    if (!state.attested || submitting) return;
    for (const s of [1, 2, 3, 4]) {
      const e = validate(s);
      if (Object.keys(e).length > 0) {
        setErrors(e);
        setStep(s);
        focusFirstError(e);
        return;
      }
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const created = await seriesApi.create(buildPayload());
      submittedRef.current = true;
      showToast("Série criada. A IA está planejando os 20 episódios.", "success");
      router.push(`/series/${created.id}`);
    } catch (err) {
      handleSubmitError(err);
      setSubmitting(false);
    }
  }

  function handleSubmitError(err: unknown) {
    if (err instanceof ApiError && err.status === 404 && err.detail !== "Not Found") {
      setStep(1);
      setErrors({ channel_id: "Canal não encontrado. Escolha outro canal." });
      return;
    }
    if (err instanceof ApiError && err.status === 422 && Array.isArray(err.detail)) {
      const fieldErrors: FieldErrors = {};
      for (const issue of err.detail) {
        const field = String(issue.loc?.[issue.loc.length - 1] ?? "");
        if (field === "originality_attestation") fieldErrors[field] = "Marque a declaração de originalidade";
        else if (field) fieldErrors[field] = issue.msg;
      }
      const steps = Object.keys(fieldErrors).map((f) => FIELD_STEP[f] ?? 5);
      if (steps.length > 0) {
        setErrors(fieldErrors);
        setStep(Math.min(...steps));
        setBanner({ message: Object.values(fieldErrors).join(" ") });
        return;
      }
    }
    if (err instanceof ApiError && err.status === 422 && typeof err.detail === "string") {
      setBanner({ message: err.detail });
      return;
    }
    setBanner({ code: err instanceof ApiError ? err.code : undefined, message: seriesErrorMessage(err, "Não foi possível criar a série.") });
  }

  const budgetNumber = state.budget.trim() ? Number(state.budget) : null;
  const channelPlatforms = channel
    ? Object.entries(channel.counts.accounts_by_platform)
        .filter(([, n]) => n > 0)
        .map(([p]) => PLATFORM_LABELS[p as PlatformValue] ?? p)
    : [];

  if (providersRes.unavailable) return <UnavailableNotice onRetry={providersRes.reload} />;
  if (providersRes.loading && !providers) return <SkeletonList rows={4} />;
  if (providersRes.error && !providers) {
    return <LoadError title="Não foi possível carregar os provedores" message={providersRes.error} onRetry={providersRes.reload} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <WizardStepper step={step} />

      <section aria-labelledby="wizard-step-heading" className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950 sm:p-6">
        <h2
          id="wizard-step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-slate-900 outline-none dark:text-slate-50"
        >
          Passo {step}: {STEP_TITLES[step - 1]}
        </h2>

        {banner ? (
          <Notice
            tone="danger"
            action={
              banner.code === "active_series_limit" ? (
                <Link href="/series" className={linkClass}>
                  Ver minhas séries
                </Link>
              ) : undefined
            }
          >
            {banner.message}
          </Notice>
        ) : null}

        {Object.keys(errors).length > 0 && step < 5 ? (
          <div role="alert" className="rounded-md border border-red-400 bg-red-50 p-2 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-medium">Corrija os campos abaixo para continuar:</p>
            <ul className="list-inside list-disc">
              {Object.entries(errors).map(([k, msg]) => (
                <li key={k}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <StepIdea
            state={state}
            errors={errors}
            onChange={change}
            channels={channels}
            channelsLoading={channelsLoading}
            channelPlatforms={channelPlatforms}
            channelColor={channel?.color ?? null}
            hasChannel={!!channel}
          />
        ) : null}
        {step === 2 ? (
          <StrategyStep
            state={state}
            providers={providers}
            estimates={estimates}
            error={errors.max_video_scenes_per_episode}
            onChange={change}
          />
        ) : null}
        {step === 3 && providers ? <ProviderStep state={state} providers={providers} errors={errors} onChange={change} /> : null}
        {step === 4 ? (
          <StepPublish
            state={state}
            errors={errors}
            onChange={change}
            seasonEstimate={currentEstimate?.season_usd ?? null}
            budgetNumber={budgetNumber}
            usage={usage}
          />
        ) : null}
        {step === 5 ? (
          <StepReview
            state={state}
            channelName={channel?.name ?? "—"}
            providers={providers}
            estimate={currentEstimate}
            error={errors.originality_attestation}
            onChange={change}
            goTo={(s) => {
              setBanner(null);
              setStep(s);
            }}
          />
        ) : null}
      </section>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={() => {
            setBanner(null);
            setStep((s) => Math.max(1, s - 1));
          }}
          disabled={step === 1 || submitting}
          className={secondaryButton}
        >
          Voltar
        </button>
        {step < 5 ? (
          <button type="button" onClick={goNext} className={primaryButton}>
            Continuar
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={submit}
              aria-disabled={!state.attested || submitting}
              aria-describedby="wizard-submit-help"
              className={primaryButton}
            >
              {submitting ? "Criando…" : "Criar série e planejar"}
            </button>
            {!state.attested ? (
              <span id="wizard-submit-help" className={hintClass}>
                Marque a declaração para continuar
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function WizardStepper({ step }: { step: number }) {
  return (
    <>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 md:hidden">
        Passo {step} de 5 — {STEP_TITLES[step - 1]}
      </p>
      <ol className="hidden items-center gap-2 md:flex" aria-label="Passos">
        {STEP_TITLES.map((title, i) => {
          const n = i + 1;
          const current = n === step;
          return (
            <li key={title} aria-current={current ? "step" : undefined} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  current
                    ? "bg-indigo-600 text-white"
                    : n < step
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                }`}
              >
                <span aria-hidden="true">{n < step ? "✓" : n}</span>
                <span className="sr-only">{n < step ? "Concluído: passo " : "Passo "}{n}</span>
              </span>
              <span className={`text-xs ${current ? "font-semibold text-slate-900 dark:text-slate-50" : "text-slate-600 dark:text-slate-300"}`}>{title}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function StepIdea({
  state,
  errors,
  onChange,
  channels,
  channelsLoading,
  channelPlatforms,
  channelColor,
  hasChannel,
}: {
  state: WizardState;
  errors: FieldErrors;
  onChange: (patch: Partial<WizardState>) => void;
  channels: { id: string; name: string; color: string | null }[];
  channelsLoading: boolean;
  channelPlatforms: string[];
  channelColor: string | null;
  hasChannel: boolean;
}) {
  const len = state.premise.length;
  const missing = MIN_PREMISE_LENGTH - state.premise.trim().length;
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (len === MIN_PREMISE_LENGTH) setAnnounce("Mínimo de 50 caracteres atingido.");
    else if (len === 3800) setAnnounce("Perto do limite de 4000 caracteres.");
  }, [len]);

  return (
    <div className="flex flex-col gap-5">
      <div data-field="title">
        <Field id="wizard-title" label="Título (opcional)" hint="Deixe vazio e a IA sugere um título." error={errors.title}>
          <input id="wizard-title" maxLength={120} value={state.title} onChange={(e) => onChange({ title: e.target.value })} className={inputClass} aria-describedby="wizard-title-hint" />
        </Field>
      </div>

      <div data-field="premise">
        <Field
          id="wizard-premise"
          label="Premissa *"
          error={errors.premise}
          hint="A premissa não pode ser alterada depois. Escreva o ponto de partida, o conflito e o tom. Os personagens e o desfecho a IA cria."
          counter={
            <span className={`text-xs ${len > MAX_PREMISE_LENGTH ? "text-red-600" : "text-slate-500 dark:text-slate-400"}`}>
              {len}/{MAX_PREMISE_LENGTH}
            </span>
          }
        >
          <textarea
            id="wizard-premise"
            rows={6}
            value={state.premise}
            onChange={(e) => onChange({ premise: e.target.value })}
            aria-describedby="wizard-premise-hint"
            aria-invalid={errors.premise ? true : undefined}
            className={inputClass}
          />
          {missing > 0 && len > 0 ? <p className="text-xs text-amber-700 dark:text-amber-300">Faltam {missing} caracteres</p> : null}
          <span aria-live="polite" className="sr-only">
            {announce}
          </span>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div data-field="genre" className="flex flex-col gap-2">
          <Field id="wizard-genre" label="Gênero *" error={errors.genre}>
            <select id="wizard-genre" value={state.genre} onChange={(e) => onChange({ genre: e.target.value })} className={inputClass}>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
              <option value={OTHER}>Outro…</option>
            </select>
          </Field>
          {state.genre === OTHER ? (
            <input aria-label="Outro gênero" value={state.genreOther} onChange={(e) => onChange({ genreOther: e.target.value })} className={inputClass} />
          ) : null}
        </div>
        <div data-field="tone" className="flex flex-col gap-2">
          <Field id="wizard-tone" label="Tom *" error={errors.tone}>
            <select id="wizard-tone" value={state.tone} onChange={(e) => onChange({ tone: e.target.value })} className={inputClass}>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
              <option value={OTHER}>Outro…</option>
            </select>
          </Field>
          {state.tone === OTHER ? (
            <input aria-label="Outro tom" value={state.toneOther} onChange={(e) => onChange({ toneOther: e.target.value })} className={inputClass} />
          ) : null}
        </div>
      </div>

      <div data-field="channel_id" className="flex flex-col gap-2">
        <Field id="wizard-channel" label="Canal *" error={errors.channel_id}>
          <div className="flex items-center gap-2">
            {hasChannel ? <ChannelColorDot color={channelColor} /> : null}
            <select
              id="wizard-channel"
              value={state.channelId}
              onChange={(e) => onChange({ channelId: e.target.value })}
              disabled={channelsLoading}
              className={inputClass}
            >
              <option value="">Selecione…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </Field>
        {!channelsLoading && channels.length === 0 ? (
          <p className={hintClass}>
            Você ainda não tem canais.{" "}
            <Link href="/cortes/canais" className={linkClass}>
              Criar um canal
            </Link>
          </p>
        ) : null}
        {hasChannel ? (
          channelPlatforms.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Plataformas do canal">
              {channelPlatforms.map((p) => (
                <li key={p} className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="warning" role="status">
              Este canal não tem contas. Você pode criar a série, mas só poderá iniciá-la depois de conectar uma conta.{" "}
              <Link href="/cortes/contas" className={linkClass}>
                Gerenciar contas
              </Link>
            </Notice>
          )
        ) : null}
      </div>
    </div>
  );
}

function StepPublish({
  state,
  errors,
  onChange,
  seasonEstimate,
  budgetNumber,
  usage,
}: {
  state: WizardState;
  errors: FieldErrors;
  onChange: (patch: Partial<WizardState>) => void;
  seasonEstimate: number | null;
  budgetNumber: number | null;
  usage: UsageRead | null;
}) {
  const belowEstimate = budgetNumber != null && seasonEstimate != null && budgetNumber < seasonEstimate;
  const monthlyLeft =
    usage && usage.monthly_ai_budget_usd != null ? Math.max(0, usage.monthly_ai_budget_usd - usage.ai_spend_month_usd) : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div data-field="publish_time">
          <Field id="wizard-time" label="Horário de publicação" error={errors.publish_time}>
            <input id="wizard-time" type="time" value={state.publishTime} onChange={(e) => onChange({ publishTime: e.target.value })} className={inputClass} />
          </Field>
        </div>
        <Field id="wizard-tz" label="Fuso horário">
          <select id="wizard-tz" value={state.timezone} onChange={(e) => onChange({ timezone: e.target.value })} className={inputClass}>
            {(TIMEZONES.includes(state.timezone) ? TIMEZONES : [state.timezone, ...TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Antecedência</legend>
        {([1, 2] as const).map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
            <input type="radio" name="wizard-lead" checked={state.leadDays === d} onChange={() => onChange({ leadDays: d })} className="h-4 w-4" />
            {d === 1 ? "1 dia" : "2 dias (recomendado)"}
          </label>
        ))}
        <p className={hintClass}>
          Quantos dias antes da publicação o episódio começa a ser preparado. Com 2 dias você tem mais folga para aprovar roteiro e vídeo.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Privacidade</legend>
        <div className="flex flex-wrap gap-4">
          {PRIVACY_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input type="radio" name="wizard-privacy" checked={state.privacy === o.value} onChange={() => onChange({ privacy: o.value })} className="h-4 w-4" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input
            type="checkbox"
            checked={state.requireScriptApproval}
            onChange={(e) => onChange({ requireScriptApproval: e.target.checked })}
            className="mt-0.5 h-4 w-4"
          />
          <span>Exigir aprovação do roteiro antes de gerar mídia</span>
        </label>
        {!state.requireScriptApproval ? (
          <Notice tone="warning" role="status">
            Sem essa aprovação a IA gasta com imagens, vídeo e voz assim que o roteiro estiver pronto.
          </Notice>
        ) : null}
      </div>

      <div data-field="max_regenerations_per_episode">
        <Field id="wizard-regens" label="Limite de regenerações por episódio" hint="Evita gasto repetido no mesmo episódio." error={errors.max_regenerations_per_episode}>
          <input id="wizard-regens" type="number" min={0} max={10} value={state.maxRegens} onChange={(e) => onChange({ maxRegens: e.target.value })} className={`${inputClass} max-w-[8rem]`} aria-describedby="wizard-regens-hint" />
        </Field>
      </div>

      <div data-field="budget_limit_usd" className="flex flex-col gap-2">
        <Field id="wizard-budget" label="Orçamento da série (US$, opcional)" hint="Ao atingir o limite a série é pausada automaticamente." error={errors.budget_limit_usd}>
          <input id="wizard-budget" type="number" min={0} step="0.5" value={state.budget} onChange={(e) => onChange({ budget: e.target.value })} className={`${inputClass} max-w-[10rem]`} aria-describedby="wizard-budget-hint" />
        </Field>
        {seasonEstimate != null ? <p className={hintClass}>Estimativa da temporada: {formatUsd(seasonEstimate)}.</p> : null}
        {belowEstimate ? (
          <Notice tone="warning" role="status">
            Abaixo da estimativa ({formatUsd(seasonEstimate)}): a série deve pausar antes do fim.
          </Notice>
        ) : null}
        {monthlyLeft != null ? <p className={hintClass}>Orçamento mensal de IA restante: {formatUsd(monthlyLeft)}.</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked={state.monetization} onChange={(e) => onChange({ monetization: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>Monetização permitida</span>
        </label>
        <p className={hintClass}>
          Marque se o canal será monetizado. Isso afeta quais plataformas podem publicar. Conteúdo gerado em massa por IA pode ter a monetização negada
          pelas plataformas.
        </p>
      </div>
    </div>
  );
}

function StepReview({
  state,
  channelName,
  providers,
  estimate,
  error,
  onChange,
  goTo,
}: {
  state: WizardState;
  channelName: string;
  providers: ProvidersResponse | null;
  estimate: { per_episode_usd: number; season_usd: number } | null;
  error?: string;
  onChange: (patch: Partial<WizardState>) => void;
  goTo: (step: number) => void;
}) {
  const name = (list: { id: string; name: string }[] | undefined, id: string) => list?.find((p) => p.id === id)?.name ?? (id || "—");
  const privacy = PRIVACY_OPTIONS.find((o) => o.value === state.privacy)?.label;
  const rows: { label: string; value: string; step: number }[] = [
    { label: "Título", value: state.title.trim() || "A IA sugere", step: 1 },
    { label: "Premissa", value: state.premise.trim(), step: 1 },
    { label: "Gênero e tom", value: `${effectiveGenre(state)} · ${effectiveTone(state)}`, step: 1 },
    { label: "Canal", value: channelName, step: 1 },
    {
      label: "Estilo visual",
      value: `${{ economy: "Economia", hybrid: "Híbrido", full_video: "Vídeo completo" }[state.strategy]}${state.strategy === "hybrid" ? ` (${state.maxVideoScenes} cena(s) em vídeo)` : ""}`,
      step: 2,
    },
    { label: "Imagem", value: name(providers?.image, state.imageProvider), step: 3 },
    ...(state.strategy !== "economy" ? [{ label: "Vídeo", value: name(providers?.video, state.videoProvider), step: 3 }] : []),
    { label: "Narração", value: `${name(providers?.tts, state.ttsProvider)} · voz ${state.ttsVoiceId || "—"}`, step: 3 },
    { label: "Publicação", value: `${state.publishTime} (${state.timezone}) · ${state.leadDays} dia(s) de antecedência · ${privacy}`, step: 4 },
    { label: "Aprovação do roteiro", value: state.requireScriptApproval ? "Exigida" : "Não exigida", step: 4 },
    { label: "Regenerações por episódio", value: state.maxRegens, step: 4 },
    { label: "Orçamento", value: state.budget.trim() ? formatUsd(Number(state.budget)) : "Sem limite", step: 4 },
    { label: "Monetização", value: state.monetization ? "Permitida" : "Não permitida", step: 4 },
  ];
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col divide-y divide-slate-200 text-sm dark:divide-slate-700">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <dt className="w-44 shrink-0 text-slate-500 dark:text-slate-400">{r.label}</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-900 dark:text-slate-50">{r.value}</dd>
            <button type="button" onClick={() => goTo(r.step)} className={`${linkClass} text-xs`} aria-label={`Editar ${r.label}`}>
              Editar
            </button>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border-2 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-100">
        {estimate ? (
          <p>
            Estimativa da temporada: <strong>{formatUsd(estimate.season_usd)}</strong> ({formatUsd(estimate.per_episode_usd)} por episódio). Você só gasta
            com mídia depois de aprovar cada roteiro.
          </p>
        ) : (
          <p>Estimativa indisponível no momento. Você só gasta com mídia depois de aprovar cada roteiro.</p>
        )}
      </div>

      <div data-field="originality_attestation" className="flex flex-col gap-2">
        <label className="flex items-start gap-3 rounded-md border border-slate-300 p-3 text-sm text-slate-800 dark:border-slate-600 dark:text-slate-100">
          <input
            type="checkbox"
            checked={state.attested}
            onChange={(e) => onChange({ attested: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-describedby="wizard-attest-note"
          />
          <span>{ATTESTATION_TEXT}</span>
        </label>
        <p id="wizard-attest-note" className={hintClass}>
          A IA recusa premissas que copiem obras protegidas. Cada episódio ainda passa pela sua aprovação antes de ir ao ar.
        </p>
        {error ? (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
