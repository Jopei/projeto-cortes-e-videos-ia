"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import type { AnalysisParams, Channel } from "@/lib/channels";
import { SIGNAL_LABELS, SIGNAL_NAMES } from "@/lib/clips";
import { PRESET_LABELS, PRESETS, listPresets, type Preset, type PresetWeights } from "@/lib/jobs";
import { analyzeMediaAsset, type MediaAsset } from "@/lib/media-assets";
import { Dialog } from "@/components/ui/Dialog";

const inputClass =
  "field-control w-full";
const labelClass = "text-sm font-medium text-fg-muted";

type AnalyzeDialogProps = {
  mediaAsset: MediaAsset | null;
  channels: Channel[];
  onClose: () => void;
  onAnalyzed: () => void;
};

export function AnalyzeDialog({ mediaAsset, channels, onClose, onAnalyzed }: AnalyzeDialogProps) {
  const [channelId, setChannelId] = useState<string>(mediaAsset?.channel_id ?? "");
  const [preset, setPreset] = useState<Preset | "">("");
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("60");
  const [maxClips, setMaxClips] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [reframeMode, setReframeMode] = useState<"auto" | "blur" | "center">("auto");
  const [presetWeights, setPresetWeights] = useState<PresetWeights[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = useMemo(() => channels.find((c) => c.id === channelId) ?? null, [channels, channelId]);

  useEffect(() => {
    if (!mediaAsset) return;
    const controller = new AbortController();
    listPresets(controller.signal)
      .then(setPresetWeights)
      .catch(() => undefined);
    return () => controller.abort();
  }, [mediaAsset]);

  // Pre-fill from the channel's defaults whenever the selected channel changes.
  useEffect(() => {
    if (!mediaAsset) return;
    setChannelId(mediaAsset.channel_id ?? "");
  }, [mediaAsset]);

  useEffect(() => {
    if (!channel) return;
    setPreset(channel.default_preset ?? "");
    const params = channel.default_params;
    if (params) {
      setWeights(params.weights ?? null);
      if (params.min_duration != null) setMinDuration(String(params.min_duration));
      if (params.max_duration != null) setMaxDuration(String(params.max_duration));
      if (params.max_clips != null) setMaxClips(String(params.max_clips));
      if (params.language) setLanguage(params.language);
      if (params.burn_subtitles != null) setBurnSubtitles(params.burn_subtitles);
      if (params.reframe_mode) setReframeMode(params.reframe_mode);
    }
  }, [channel]);

  function handlePresetChange(value: Preset | "") {
    setPreset(value);
    if (value && value !== "custom") {
      const found = presetWeights.find((p) => p.preset === value);
      if (found) setWeights(found.weights);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaAsset) return;
    setError(null);

    if (!preset && !channel?.default_preset) {
      setError("Selecione um preset ou um canal com preset padrão definido.");
      return;
    }

    const params: AnalysisParams = {
      weights: weights ?? undefined,
      min_duration: minDuration ? Number(minDuration) : undefined,
      max_duration: maxDuration ? Number(maxDuration) : undefined,
      max_clips: maxClips ? Number(maxClips) : undefined,
      language: language || undefined,
      burn_subtitles: burnSubtitles,
      reframe_mode: reframeMode,
    };

    setSubmitting(true);
    try {
      await analyzeMediaAsset(mediaAsset.id, {
        preset: preset || undefined,
        params,
        channel_id: channelId || undefined,
      });
      onAnalyzed();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
            ? formatApiErrorDetail(err.detail)
            : err.message
          : "Erro inesperado ao iniciar a análise.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={mediaAsset !== null} onClose={onClose} title="Analisar vídeo" widthClassName="max-w-2xl">
      {mediaAsset ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            Arquivo: <span className="font-medium">{mediaAsset.filename}</span>
          </p>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <label htmlFor="analyze-channel" className={labelClass}>
              Canal
            </label>
            <select
              id="analyze-channel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className={inputClass}
            >
              <option value="">Nenhum</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="analyze-preset" className={labelClass}>
              Preset {channel?.default_preset ? "(padrão do canal pré-selecionado)" : ""}
            </label>
            <select
              id="analyze-preset"
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value as Preset | "")}
              className={inputClass}
            >
              <option value="">
                {channel?.default_preset ? `Usar padrão do canal (${PRESET_LABELS[channel.default_preset]})` : "Selecione…"}
              </option>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {weights ? (
            <div className="flex flex-col gap-2">
              <p className={labelClass}>Pesos por sinal</p>
              {SIGNAL_NAMES.map((signal) => (
                <div key={signal} className="flex items-center gap-3">
                  <label htmlFor={`analyze-weight-${signal}`} className="w-24 shrink-0 text-sm text-fg-muted">
                    {SIGNAL_LABELS[signal]}
                  </label>
                  <input
                    id={`analyze-weight-${signal}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[signal] ?? 0}
                    onChange={(e) =>
                      setWeights((prev) => ({ ...(prev ?? {}), [signal]: Number(e.target.value) }))
                    }
                    className="flex-1"
                  />
                  <span className="w-10 shrink-0 text-right text-sm text-fg-subtle">
                    {(weights[signal] ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="analyze-min-duration" className={labelClass}>
                Duração mínima (s)
              </label>
              <input
                id="analyze-min-duration"
                type="number"
                min={1}
                step="0.5"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="analyze-max-duration" className={labelClass}>
                Duração máxima (s)
              </label>
              <input
                id="analyze-max-duration"
                type="number"
                min={1}
                step="0.5"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-fg-subtle">
                Shorts até 60 s; YouTube aceita até 3 min.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="analyze-max-clips" className={labelClass}>
                Máximo de cortes
              </label>
              <input
                id="analyze-max-clips"
                type="number"
                min={1}
                value={maxClips}
                onChange={(e) => setMaxClips(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="analyze-language" className={labelClass}>
                Idioma
              </label>
              <input
                id="analyze-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="analyze-reframe" className={labelClass}>
                Reenquadramento
              </label>
              <select
                id="analyze-reframe"
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
                id="analyze-burn-subtitles"
                type="checkbox"
                checked={burnSubtitles}
                onChange={(e) => setBurnSubtitles(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="analyze-burn-subtitles" className={labelClass}>
                Queimar legendas
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Enviando…" : "Iniciar análise"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
