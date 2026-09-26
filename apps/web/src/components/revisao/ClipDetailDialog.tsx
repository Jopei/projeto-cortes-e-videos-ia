"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { PLATFORM_LABELS, PLATFORM_VALUES, type PlatformValue } from "@/lib/channels";
import {
  clipVideoUrl,
  getClip,
  regenerateClipMetadata,
  updateClip,
  upsertClipMetadata,
  type ClipDetail,
  type ClipMetadata,
} from "@/lib/clips";
import { Dialog } from "@/components/ui/Dialog";
import { ClipStatusBadge } from "@/components/ui/StatusBadges";
import { useToast } from "@/components/ui/Toast";
import { formatDuration } from "@/lib/tus";

const TRIM_STEP = 0.5;

/** Per-platform hard title length limits enforced in the UI (mirrors backend
 * metadata rules, e.g. Vimeo caps titles at 128 chars). Platforms without an
 * entry here have no enforced limit — only the character counter is shown. */
const TITLE_MAX_LENGTH: Partial<Record<PlatformValue, number>> = {
  vimeo: 128,
};

/** Vimeo has no hashtag concept — the same field is used as plain tags. */
const HASHTAGS_FIELD_LABEL: Partial<Record<PlatformValue, string>> = {
  vimeo: "Tags (separadas por vírgula)",
};

type EditableMetadata = {
  title: string;
  description: string;
  hashtags: string;
  dirty: boolean;
};

function toEditable(entry: ClipMetadata | undefined): EditableMetadata {
  return {
    title: entry?.title ?? "",
    description: entry?.description ?? "",
    hashtags: entry?.hashtags?.join(", ") ?? "",
    dirty: false,
  };
}

export function ClipDetailDialog({
  clipId,
  onClose,
  onChanged,
}: {
  clipId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<ClipDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startInput, setStartInput] = useState("0");
  const [endInput, setEndInput] = useState("0");
  const [trimSaving, setTrimSaving] = useState(false);

  const [activePlatform, setActivePlatform] = useState<PlatformValue>("youtube");
  const [metadataDrafts, setMetadataDrafts] = useState<Record<string, EditableMetadata>>({});
  const [savingPlatform, setSavingPlatform] = useState<PlatformValue | null>(null);
  const [regenerating, setRegenerating] = useState<PlatformValue | "all" | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClip(id);
      setDetail(data);
      setStartInput(String(data.start_s));
      setEndInput(String(data.end_s));
      const drafts: Record<string, EditableMetadata> = {};
      for (const platform of PLATFORM_VALUES) {
        drafts[platform] = toEditable(data.metadata.find((m) => m.platform === platform));
      }
      setMetadataDrafts(drafts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o corte.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (clipId) load(clipId);
    else {
      setDetail(null);
      setError(null);
    }
  }, [clipId, load]);

  const draft = metadataDrafts[activePlatform];

  function adjustTrim(field: "start" | "end", delta: number) {
    if (field === "start") {
      setStartInput((prev) => String(Math.max(0, Number(prev || 0) + delta)));
    } else {
      setEndInput((prev) => String(Math.max(0, Number(prev || 0) + delta)));
    }
  }

  async function handleSaveTrim() {
    if (!detail) return;
    const start_s = Number(startInput);
    const end_s = Number(endInput);
    if (Number.isNaN(start_s) || Number.isNaN(end_s) || start_s >= end_s) {
      showToast("Início deve ser menor que o fim.", "error");
      return;
    }
    setTrimSaving(true);
    try {
      const updated = await updateClip(detail.id, { start_s, end_s });
      setDetail((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast("Recorte salvo. O clipe entrou em renderização novamente.", "success");
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao salvar o recorte.", "error");
    } finally {
      setTrimSaving(false);
    }
  }

  async function handleSaveMetadata(platform: PlatformValue) {
    if (!detail || !draft) return;
    setSavingPlatform(platform);
    try {
      const updated = await upsertClipMetadata(detail.id, platform, {
        title: draft.title || null,
        description: draft.description || null,
        hashtags: draft.hashtags
          ? draft.hashtags.split(",").map((h) => h.trim()).filter(Boolean)
          : [],
      });
      setMetadataDrafts((prev) => ({ ...prev, [platform]: toEditable(updated) }));
      showToast(`Metadados de ${PLATFORM_LABELS[platform]} salvos.`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao salvar metadados.", "error");
    } finally {
      setSavingPlatform(null);
    }
  }

  async function handleRegenerate(platform: PlatformValue | "all") {
    if (!detail) return;
    setRegenerating(platform);
    try {
      await regenerateClipMetadata(detail.id, platform === "all" ? undefined : platform);
      showToast("Regeneração de metadados enfileirada.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao regenerar metadados.", "error");
    } finally {
      setRegenerating(null);
    }
  }

  async function handleDecision(status: "approved" | "rejected") {
    if (!detail) return;
    setDecisionLoading(true);
    try {
      const updated = await updateClip(detail.id, { status });
      setDetail((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast(status === "approved" ? "Corte aprovado." : "Corte rejeitado.", "success");
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao registrar decisão.", "error");
    } finally {
      setDecisionLoading(false);
    }
  }

  const titleCount = draft?.title.length ?? 0;
  const titleMax = TITLE_MAX_LENGTH[activePlatform];
  const hashtagsLabel = HASHTAGS_FIELD_LABEL[activePlatform] ?? "Hashtags (separadas por vírgula)";

  return (
    <Dialog open={clipId !== null} onClose={onClose} title="Detalhe do corte" widthClassName="max-w-4xl">
      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : detail ? (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex flex-col gap-3 lg:w-72 lg:shrink-0">
            <div className="aspect-[9/16] w-full overflow-hidden rounded-md bg-black">
              {detail.storage_key ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- captions come burned into the video when enabled
                <video controls className="h-full w-full" src={clipVideoUrl(detail.id)} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Ainda renderizando…
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <ClipStatusBadge status={detail.status} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Score: {detail.score != null ? detail.score.toFixed(2) : "—"}
              </span>
            </div>

            <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                Ajuste fino (segundos)
              </legend>
              <div className="flex items-center gap-2">
                <label htmlFor="trim-start" className="w-12 text-sm text-slate-600 dark:text-slate-300">
                  Início
                </label>
                <button type="button" onClick={() => adjustTrim("start", -TRIM_STEP)} className="rounded border border-slate-300 px-2 text-sm dark:border-slate-600">
                  −0,5
                </button>
                <input
                  id="trim-start"
                  type="number"
                  step="0.1"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button type="button" onClick={() => adjustTrim("start", TRIM_STEP)} className="rounded border border-slate-300 px-2 text-sm dark:border-slate-600">
                  +0,5
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="trim-end" className="w-12 text-sm text-slate-600 dark:text-slate-300">
                  Fim
                </label>
                <button type="button" onClick={() => adjustTrim("end", -TRIM_STEP)} className="rounded border border-slate-300 px-2 text-sm dark:border-slate-600">
                  −0,5
                </button>
                <input
                  id="trim-end"
                  type="number"
                  step="0.1"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button type="button" onClick={() => adjustTrim("end", TRIM_STEP)} className="rounded border border-slate-300 px-2 text-sm dark:border-slate-600">
                  +0,5
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Duração: {formatDuration(Math.max(0, Number(endInput) - Number(startInput)))}
              </p>
              <button
                type="button"
                onClick={handleSaveTrim}
                disabled={trimSaving}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {trimSaving ? "Salvando…" : "Salvar recorte (re-renderiza)"}
              </button>
            </fieldset>

            {detail.transcript ? (
              <details className="rounded-md border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <summary className="cursor-pointer font-medium">Transcrição</summary>
                <p className="mt-1 whitespace-pre-wrap">{detail.transcript}</p>
              </details>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDecision("approved")}
                disabled={decisionLoading}
                className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Aprovar (A)
              </button>
              <button
                type="button"
                onClick={() => handleDecision("rejected")}
                disabled={decisionLoading}
                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Rejeitar (R)
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
              {PLATFORM_VALUES.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setActivePlatform(platform)}
                  aria-current={activePlatform === platform ? "true" : undefined}
                  className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                    activePlatform === platform
                      ? "border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {PLATFORM_LABELS[platform]}
                </button>
              ))}
            </div>

            {draft ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="meta-title" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Título
                    </label>
                    <span
                      className={`text-xs ${
                        titleMax && titleCount > titleMax ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"
                      }`}
                    >
                      {titleCount}
                      {titleMax ? `/${titleMax}` : ""} caracteres
                    </span>
                  </div>
                  <input
                    id="meta-title"
                    value={draft.title}
                    maxLength={titleMax}
                    onChange={(e) =>
                      setMetadataDrafts((prev) => ({
                        ...prev,
                        [activePlatform]: { ...prev[activePlatform], title: e.target.value, dirty: true },
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="meta-description" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Descrição
                  </label>
                  <textarea
                    id="meta-description"
                    rows={4}
                    value={draft.description}
                    onChange={(e) =>
                      setMetadataDrafts((prev) => ({
                        ...prev,
                        [activePlatform]: { ...prev[activePlatform], description: e.target.value, dirty: true },
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="meta-hashtags" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {hashtagsLabel}
                  </label>
                  <input
                    id="meta-hashtags"
                    value={draft.hashtags}
                    onChange={(e) =>
                      setMetadataDrafts((prev) => ({
                        ...prev,
                        [activePlatform]: { ...prev[activePlatform], hashtags: e.target.value, dirty: true },
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveMetadata(activePlatform)}
                    disabled={savingPlatform === activePlatform}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingPlatform === activePlatform ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerate(activePlatform)}
                    disabled={regenerating === activePlatform}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {regenerating === activePlatform ? "Regenerando…" : "Regenerar esta plataforma"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerate("all")}
                    disabled={regenerating === "all"}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {regenerating === "all" ? "Regenerando…" : "Regenerar todas"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
