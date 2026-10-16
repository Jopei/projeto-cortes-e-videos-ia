"use client";

import { useEffect, useId, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import {
  estimateCost,
  type EstimateResponse,
  type ProvidersResponse,
  type VisualStrategy,
} from "@/lib/series";
import { seriesErrorMessage } from "@/lib/series-errors";
import { Notice, Field, inputClass } from "@/components/series/common";
import type { WizardState } from "@/components/series/wizard-state";

type EstimateEntry = { loading: boolean; data: EstimateResponse | null; error: string | null };

const STRATEGIES: { value: VisualStrategy; title: string; subtitle: string; description: string }[] = [
  {
    value: "economy",
    title: "Economia",
    subtitle: "Só imagens animadas",
    description: 'Mais barato. Efeito "slideshow com zoom".',
  },
  {
    value: "hybrid",
    title: "Híbrido (recomendado)",
    subtitle: "Poucas cenas em vídeo + imagens",
    description: "Equilíbrio: movimento real nas cenas de maior impacto.",
  },
  {
    value: "full_video",
    title: "Vídeo completo",
    subtitle: "Todas as cenas em vídeo",
    description: "Mais caro. Todas as cenas em movimento real.",
  },
];

/** Real estimate from `POST /api/series/estimate` for every strategy, using the selected providers. */
export function useStrategyEstimates(state: WizardState, enabled: boolean): Record<VisualStrategy, EstimateEntry> {
  const [entries, setEntries] = useState<Record<VisualStrategy, EstimateEntry>>({
    economy: { loading: true, data: null, error: null },
    hybrid: { loading: true, data: null, error: null },
    full_video: { loading: true, data: null, error: null },
  });
  const scenes = Math.min(6, Math.max(1, Number(state.maxVideoScenes) || 1));
  const depKey = `${state.videoProvider}|${state.imageProvider}|${state.ttsProvider}|${scenes}`;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setEntries((prev) => ({
      economy: { ...prev.economy, loading: true },
      hybrid: { ...prev.hybrid, loading: true },
      full_video: { ...prev.full_video, loading: true },
    }));
    const timer = window.setTimeout(() => {
      for (const { value } of STRATEGIES) {
        estimateCost(
          {
            visual_strategy: value,
            max_video_scenes_per_episode: scenes,
            video_provider: state.videoProvider || null,
            image_provider: state.imageProvider || null,
            tts_provider: state.ttsProvider || null,
          },
          controller.signal,
        )
          .then((data) => {
            if (!controller.signal.aborted) setEntries((p) => ({ ...p, [value]: { loading: false, data, error: null } }));
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            const msg = err instanceof ApiError && err.status === 422 && typeof err.detail === "string" ? err.detail : seriesErrorMessage(err, "Estimativa indisponível.");
            setEntries((p) => ({ ...p, [value]: { loading: false, data: null, error: msg } }));
          });
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, enabled]);

  return entries;
}

export function StrategyStep({
  state,
  providers,
  estimates,
  error,
  onChange,
}: {
  state: WizardState;
  providers: ProvidersResponse | null;
  estimates: Record<VisualStrategy, EstimateEntry>;
  error?: string;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const groupId = useId();
  const noVideo = providers ? !providers.video.some((p) => p.configured) : false;
  const current = estimates[state.strategy];

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg-muted">Estilo visual</legend>
        <div role="radiogroup" aria-label="Estilo visual" className="grid gap-3 md:grid-cols-3">
          {STRATEGIES.map((s) => {
            const checked = state.strategy === s.value;
            const est = estimates[s.value];
            return (
              <label
                key={s.value}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-500 ${
                  checked
                    ? "border-info/40 bg-info-soft text-fg ring-2 ring-indigo-500"
                    : "border-border-strong bg-surface hover:border-indigo-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${groupId}-strategy`}
                    value={s.value}
                    checked={checked}
                    onChange={() => onChange({ strategy: s.value })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-fg">{s.title}</span>
                </span>
                <span className="text-xs text-fg-muted">{s.subtitle}</span>
                <span className="mt-1 text-sm text-fg" aria-live="polite">
                  {est.loading && !est.data ? (
                    "Calculando…"
                  ) : est.data ? (
                    <>
                      <span className="block">~{formatUsd(est.data.per_episode_usd)} / episódio</span>
                      <span className="block text-xs text-fg-muted">
                        ~{formatUsd(est.data.season_usd)} / temporada
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-fg-subtle">{est.error ?? "—"}</span>
                  )}
                </span>
                <span className="text-xs text-fg-subtle">{s.description}</span>
              </label>
            );
          })}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </fieldset>

      {noVideo && state.strategy !== "economy" ? (
        <Notice tone="warning" role="status">
          Nenhum provedor de vídeo configurado. Use Economia ou peça ao administrador para configurar.
        </Notice>
      ) : null}

      {state.strategy === "hybrid" ? (
        <Field
          id="wizard-max-video-scenes"
          label="Cenas em vídeo por episódio"
          hint="Cada cena em vídeo custa mais que uma imagem. O padrão é 1."
        >
          <input
            id="wizard-max-video-scenes"
            type="number"
            min={1}
            max={6}
            value={state.maxVideoScenes}
            onChange={(e) => onChange({ maxVideoScenes: e.target.value })}
            aria-describedby="wizard-max-video-scenes-hint"
            className={`${inputClass} max-w-[8rem]`}
          />
        </Field>
      ) : null}

      <details className="rounded-lg border border-border p-3 text-sm" open>
        <summary className="cursor-pointer font-medium text-fg">Como calculamos</summary>
        <div className="mt-2 flex flex-col gap-2 text-xs text-fg-muted">
          {current.data ? (
            <>
              <p>
                Por episódio ({STRATEGIES.find((s) => s.value === state.strategy)?.title.replace(" (recomendado)", "")}):
                vídeo {formatUsd(current.data.breakdown.video)} · imagens {formatUsd(current.data.breakdown.image)} ·
                voz {formatUsd(current.data.breakdown.tts)} · texto (IA) {formatUsd(current.data.breakdown.llm)}.
              </p>
              {current.data.assumptions.length > 0 ? (
                <ul className="list-inside list-disc">
                  {current.data.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p>{current.loading ? "Calculando a estimativa…" : current.error ?? "Estimativa indisponível."}</p>
          )}
          <p>
            Valores estimados a partir da tabela de preços dos provedores; podem diferir da fatura. Você só gasta com
            mídia depois de aprovar cada roteiro.
          </p>
        </div>
      </details>
    </div>
  );
}
