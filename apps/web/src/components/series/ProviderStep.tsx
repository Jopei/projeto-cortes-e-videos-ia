"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import { listVoices, type CostUnit, type Provider, type ProvidersResponse, type Voice } from "@/lib/series";
import { isUnavailable, seriesErrorMessage } from "@/lib/series-errors";
import { useAuth } from "@/lib/user-context";
import { Badge } from "@/components/ui/Badge";
import { Field, Notice, hintClass, inputClass, labelClass, secondaryButton } from "@/components/series/common";
import type { WizardState } from "@/components/series/wizard-state";

const UNIT_LABELS: Record<CostUnit, string> = {
  per_second: "por segundo",
  per_image: "por imagem",
  per_1k_chars: "por 1k caracteres",
};

function providerOptionLabel(p: Provider): string {
  const price = p.est_cost_usd == null ? "preço não informado" : `${formatUsd(p.est_cost_usd)} ${UNIT_LABELS[p.est_cost_unit]}`;
  const flags = [!p.configured ? "(não configurado)" : "", p.fake ? "(teste, sem custo)" : ""].filter(Boolean).join(" ");
  return `${p.name} ${flags} · ${price}`.replace(/\s+/g, " ");
}

function ProviderSelect({
  id,
  label,
  items,
  value,
  onChange,
  error,
  children,
}: {
  id: string;
  label: string;
  items: Provider[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
  children?: React.ReactNode;
}) {
  const { user } = useAuth();
  const selected = items.find((p) => p.id === value);
  const anyUnconfigured = items.some((p) => !p.configured);
  return (
    <Field id={id} label={label} error={error}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} aria-invalid={error ? true : undefined}>
        <option value="">Selecione…</option>
        {items.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.configured}>
            {providerOptionLabel(p)}
          </option>
        ))}
      </select>
      {selected?.fake ? (
        <span>
          <Badge variant="info">Teste, sem custo</Badge>
        </span>
      ) : null}
      {anyUnconfigured ? (
        <p className={hintClass}>
          {user?.is_admin ? (
            <>
              Alguns provedores não estão configurados.{" "}
              <Link href="/cortes/contas" className="font-medium text-primary-text hover:underline">
                Configurar chave
              </Link>
            </>
          ) : (
            "Alguns provedores não estão configurados. Peça ao administrador."
          )}
        </p>
      ) : null}
      {children}
    </Field>
  );
}

export function ProviderStep({
  state,
  providers,
  errors,
  onChange,
}: {
  state: WizardState;
  providers: ProvidersResponse;
  errors: Record<string, string>;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const needsVideo = state.strategy !== "economy";
  const video = providers.video.find((p) => p.id === state.videoProvider);
  const image = providers.image.find((p) => p.id === state.imageProvider);
  const noVideoConfigured = !providers.video.some((p) => p.configured);

  return (
    <div className="flex flex-col gap-5">
      <ProviderSelect
        id="wizard-image-provider"
        label="Provedor de imagem *"
        items={providers.image}
        value={state.imageProvider}
        onChange={(id) => onChange({ imageProvider: id })}
        error={errors.image_provider}
      >
        {image ? (
          <p className={hintClass}>
            {image.supports_reference_images
              ? `Aceita até ${image.max_reference_images} imagem(ns) de referência.`
              : "Este provedor ignora imagens de referência dos personagens."}
          </p>
        ) : null}
      </ProviderSelect>

      {needsVideo ? (
        <>
          {noVideoConfigured ? (
            <Notice tone="warning" role="status">
              Nenhum provedor de vídeo configurado. Volte e use Economia, ou peça ao administrador para configurar.
            </Notice>
          ) : null}
          <ProviderSelect
            id="wizard-video-provider"
            label="Provedor de vídeo *"
            items={providers.video}
            value={state.videoProvider}
            onChange={(id) => onChange({ videoProvider: id })}
            error={errors.video_provider}
          >
            {video ? (
              <p className={hintClass}>
                {video.allowed_durations?.length ? `Durações permitidas: ${video.allowed_durations.join(", ")} s. ` : ""}
                {video.supports_reference_images
                  ? `Aceita até ${video.max_reference_images} imagem(ns) de referência.`
                  : "Este provedor ignora imagens de referência dos personagens."}
              </p>
            ) : null}
          </ProviderSelect>
        </>
      ) : null}

      <ProviderSelect
        id="wizard-tts-provider"
        label="Narração (TTS) *"
        items={providers.tts}
        value={state.ttsProvider}
        onChange={(id) => onChange({ ttsProvider: id, ttsVoiceId: "" })}
        error={errors.tts_provider}
      />

      {state.ttsProvider ? (
        <VoicePicker
          provider={providers.tts.find((p) => p.id === state.ttsProvider) ?? null}
          value={state.ttsVoiceId}
          onChange={(id) => onChange({ ttsVoiceId: id })}
          error={errors.tts_voice_id}
        />
      ) : null}
    </div>
  );
}

function VoicePicker({
  provider,
  value,
  onChange,
  error,
}: {
  provider: Provider | null;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }, []);

  useEffect(() => {
    if (!provider) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setVoices(null);
    listVoices(provider.id, "pt-BR", controller.signal)
      .then((v) => setVoices(v))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(isUnavailable(err) ? "Recurso ainda indisponível: a lista de vozes não está no servidor." : seriesErrorMessage(err, "Não foi possível carregar as vozes."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      stop();
    };
  }, [provider, attempt, stop]);

  function togglePreview(voice: Voice) {
    if (playing === voice.id) {
      stop();
      return;
    }
    stop();
    if (!voice.preview_url) return;
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlaying(voice.id);
    audio.onended = () => setPlaying((p) => (p === voice.id ? null : p));
    audio.onerror = () => setPlaying((p) => (p === voice.id ? null : p));
    void audio.play().catch(() => setPlaying(null));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>Voz *</legend>
      {loading ? (
        <p className={hintClass} role="status">
          Carregando vozes…
        </p>
      ) : loadError ? (
        <div className="flex flex-col gap-2">
          <Notice
            tone="danger"
            action={
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={secondaryButton}>
                Tentar novamente
              </button>
            }
          >
            {loadError}
          </Notice>
          {provider?.fake ? (
            <Field id="wizard-voice-manual" label="ID da voz (provedor de teste)">
              <input id="wizard-voice-manual" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
            </Field>
          ) : null}
        </div>
      ) : voices && voices.length === 0 ? (
        <p className={hintClass}>Nenhuma voz em português disponível para este provedor.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">
          {(voices ?? []).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-surface-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-fg">
                <input type="radio" name="wizard-voice" value={v.id} checked={value === v.id} onChange={() => onChange(v.id)} className="h-4 w-4" />
                <span className="truncate">{v.name}</span>
                {v.gender ? <span className="text-xs text-fg-subtle">{v.gender}</span> : null}
              </label>
              <button
                type="button"
                disabled={!v.preview_url}
                onClick={() => togglePreview(v)}
                aria-label={`${playing === v.id ? "Parar" : "Ouvir"} voz ${v.name}`}
                className="btn btn-secondary btn-sm shrink-0"
              >
                {!v.preview_url ? "Sem prévia" : playing === v.id ? "Parar" : "Ouvir"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
