"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalysisParams, Channel, ChannelInput, TemplateParams } from "@/lib/channels";
import { PRESET_LABELS, PRESETS, listPresets, type Preset, type PresetWeights } from "@/lib/jobs";
import { SIGNAL_LABELS, SIGNAL_NAMES } from "@/lib/clips";
import { ApiError, formatApiErrorDetail } from "@/lib/api";

type ChannelFormProps = {
  channel?: Channel;
  onSubmit: (payload: ChannelInput) => Promise<void>;
  onCancel: () => void;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50";
const labelClass = "text-sm font-medium text-slate-700 dark:text-slate-200";

export function ChannelForm({ channel, onSubmit, onCancel }: ChannelFormProps) {
  const [name, setName] = useState(channel?.name ?? "");
  const [slug, setSlug] = useState(channel?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(channel));
  const [niche, setNiche] = useState(channel?.niche ?? "");
  const [color, setColor] = useState(channel?.color ?? "#6366f1");
  const [isActive, setIsActive] = useState(channel?.is_active ?? true);

  const [preset, setPreset] = useState<Preset | "">(channel?.default_preset ?? "");
  const [weights, setWeights] = useState<Record<string, number>>(
    () => channel?.default_params?.weights ?? { audio: 0.2, scenes: 0.2, motion: 0.2, speech: 0.2, llm: 0.2 },
  );
  const [presetWeights, setPresetWeights] = useState<PresetWeights[]>([]);

  const [minDuration, setMinDuration] = useState<string>(
    channel?.default_params?.min_duration != null ? String(channel.default_params.min_duration) : "",
  );
  const [maxDuration, setMaxDuration] = useState<string>(
    channel?.default_params?.max_duration != null ? String(channel.default_params.max_duration) : "60",
  );
  const [maxClips, setMaxClips] = useState<string>(
    channel?.default_params?.max_clips != null ? String(channel.default_params.max_clips) : "",
  );
  const [language, setLanguage] = useState(channel?.default_params?.language ?? "pt-BR");
  const [burnSubtitles, setBurnSubtitles] = useState(channel?.default_params?.burn_subtitles ?? true);
  const [reframeMode, setReframeMode] = useState<"auto" | "blur" | "center">(
    channel?.default_params?.reframe_mode ?? "auto",
  );

  const [templateLanguage, setTemplateLanguage] = useState(channel?.template?.language ?? "");
  const [templateTone, setTemplateTone] = useState(channel?.template?.tone ?? "");
  const [templateHashtags, setTemplateHashtags] = useState(
    channel?.template?.fixed_hashtags?.join(", ") ?? "",
  );
  const [templateTitleMax, setTemplateTitleMax] = useState<string>(
    channel?.template?.title_max != null ? String(channel.template.title_max) : "",
  );
  const [templateExtraDescription, setTemplateExtraDescription] = useState(
    channel?.template?.extra_description ?? "",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listPresets(controller.signal)
      .then(setPresetWeights)
      .catch(() => {
        // presets are only used to pre-fill sliders; a failure here is non-fatal
      });
    return () => controller.abort();
  }, []);

  function handlePresetChange(value: Preset | "") {
    setPreset(value);
    if (value && value !== "custom") {
      const found = presetWeights.find((p) => p.preset === value);
      if (found) setWeights(found.weights);
    }
  }

  const weightsSum = useMemo(
    () => Object.values(weights).reduce((acc, w) => acc + w, 0),
    [weights],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const defaultParams: AnalysisParams = {
      weights,
      min_duration: minDuration ? Number(minDuration) : undefined,
      max_duration: maxDuration ? Number(maxDuration) : undefined,
      max_clips: maxClips ? Number(maxClips) : undefined,
      language: language || undefined,
      burn_subtitles: burnSubtitles,
      reframe_mode: reframeMode,
    };

    const template: TemplateParams = {
      language: templateLanguage || undefined,
      tone: templateTone || undefined,
      fixed_hashtags: templateHashtags
        ? templateHashtags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      title_max: templateTitleMax ? Number(templateTitleMax) : undefined,
      extra_description: templateExtraDescription || undefined,
    };

    const payload: ChannelInput = {
      name,
      slug: slug || slugify(name),
      niche: niche || undefined,
      color: color || undefined,
      default_preset: preset || undefined,
      default_params: defaultParams,
      template,
      is_active: isActive,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 409
            ? "Já existe um canal com esse slug."
            : (err.detail ? formatApiErrorDetail(err.detail) : err.message)
          : "Erro inesperado ao salvar o canal.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
    >
      {error ? (
        <p role="alert" className="rounded-md border border-red-400 bg-red-50 p-2 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50">Identidade</legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="channel-name" className={labelClass}>
            Nome *
          </label>
          <input
            id="channel-name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="channel-slug" className={labelClass}>
            Slug *
          </label>
          <input
            id="channel-slug"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="channel-niche" className={labelClass}>
            Nicho
          </label>
          <input id="channel-niche" value={niche} onChange={(e) => setNiche(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="channel-color" className={labelClass}>
            Cor
          </label>
          <div className="flex items-center gap-2">
            <input
              id="channel-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">{color}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="channel-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor="channel-active" className={labelClass}>
            Canal ativo
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Preset e parâmetros padrão de análise
        </legend>

        <div className="flex flex-col gap-1 sm:max-w-xs">
          <label htmlFor="channel-preset" className={labelClass}>
            Preset padrão
          </label>
          <select
            id="channel-preset"
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value as Preset | "")}
            className={inputClass}
          >
            <option value="">Nenhum (exige preset explícito ao analisar)</option>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3">
          <p className={labelClass}>
            Pesos por sinal {Math.abs(weightsSum - 1) > 0.01 ? `(soma: ${weightsSum.toFixed(2)})` : null}
          </p>
          {SIGNAL_NAMES.map((signal) => (
            <div key={signal} className="flex items-center gap-3">
              <label htmlFor={`weight-${signal}`} className="w-24 shrink-0 text-sm text-slate-700 dark:text-slate-200">
                {SIGNAL_LABELS[signal]}
              </label>
              <input
                id={`weight-${signal}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[signal] ?? 0}
                onChange={(e) => setWeights((prev) => ({ ...prev, [signal]: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="w-10 shrink-0 text-right text-sm text-slate-500 dark:text-slate-400">
                {(weights[signal] ?? 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="min-duration" className={labelClass}>
              Duração mínima (segundos)
            </label>
            <input
              id="min-duration"
              type="number"
              min={1}
              step="0.5"
              value={minDuration}
              onChange={(e) => setMinDuration(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="max-duration" className={labelClass}>
              Duração máxima (segundos)
            </label>
            <input
              id="max-duration"
              type="number"
              min={1}
              step="0.5"
              value={maxDuration}
              onChange={(e) => setMaxDuration(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Shorts até 60 s; YouTube aceita até 3 min (180 s).
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="max-clips" className={labelClass}>
              Máximo de cortes por vídeo
            </label>
            <input
              id="max-clips"
              type="number"
              min={1}
              value={maxClips}
              onChange={(e) => setMaxClips(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="analysis-language" className={labelClass}>
              Idioma
            </label>
            <input
              id="analysis-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputClass}
              placeholder="pt-BR"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="reframe-mode" className={labelClass}>
              Reenquadramento
            </label>
            <select
              id="reframe-mode"
              value={reframeMode}
              onChange={(e) => setReframeMode(e.target.value as "auto" | "blur" | "center")}
              className={inputClass}
            >
              <option value="auto">Automático</option>
              <option value="blur">Blur nas laterais</option>
              <option value="center">Centralizado</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="burn-subtitles"
              type="checkbox"
              checked={burnSubtitles}
              onChange={(e) => setBurnSubtitles(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="burn-subtitles" className={labelClass}>
              Queimar legendas no vídeo
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Template de publicação
        </legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="template-language" className={labelClass}>
            Idioma do texto
          </label>
          <input
            id="template-language"
            value={templateLanguage}
            onChange={(e) => setTemplateLanguage(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="template-tone" className={labelClass}>
            Tom
          </label>
          <input
            id="template-tone"
            value={templateTone}
            onChange={(e) => setTemplateTone(e.target.value)}
            className={inputClass}
            placeholder="ex.: descontraído, informativo"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="template-title-max" className={labelClass}>
            Limite de título (caracteres)
          </label>
          <input
            id="template-title-max"
            type="number"
            min={1}
            value={templateTitleMax}
            onChange={(e) => setTemplateTitleMax(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="template-hashtags" className={labelClass}>
            Hashtags fixas (separadas por vírgula)
          </label>
          <input
            id="template-hashtags"
            value={templateHashtags}
            onChange={(e) => setTemplateHashtags(e.target.value)}
            className={inputClass}
            placeholder="#cortes, #shorts"
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="template-extra-description" className={labelClass}>
            Texto extra de descrição
          </label>
          <textarea
            id="template-extra-description"
            value={templateExtraDescription}
            onChange={(e) => setTemplateExtraDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
      </fieldset>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Salvando…" : channel ? "Salvar alterações" : "Criar canal"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
