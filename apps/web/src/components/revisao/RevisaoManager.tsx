"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import {
  CLIP_STATUS_LABELS,
  bulkUpdateClips,
  listClips,
  updateClip,
  type Clip,
  type ClipStatus,
} from "@/lib/clips";
import { ClipCard } from "@/components/revisao/ClipCard";
import { ClipDetailDialog } from "@/components/revisao/ClipDetailDialog";
import { PublishDialog } from "@/components/revisao/PublishDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

const STATUS_OPTIONS: (ClipStatus | "")[] = [
  "pending_review",
  "approved",
  "rejected",
  "rendering",
  "failed",
  "",
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
}

export function RevisaoManager() {
  const { selectedChannelId } = useChannelContext();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const jobIdFilter = searchParams.get("job_id") ?? "";
  const [statusFilter, setStatusFilter] = useState<ClipStatus | "">("pending_review");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [detailClipId, setDetailClipId] = useState<string | null>(null);
  const [publishClipIds, setPublishClipIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listClips(
          {
            channel_id: selectedChannelId || undefined,
            job_id: jobIdFilter || undefined,
            status: statusFilter || undefined,
            limit: 100,
          },
          signal,
        );
        setClips(data);
        setSelectedIds((prev) => {
          const validIds = new Set(data.map((c) => c.id));
          return new Set(Array.from(prev).filter((id) => validIds.has(id)));
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar os cortes.");
      } finally {
        setLoading(false);
      }
    },
    [selectedChannelId, jobIdFilter, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [clips.length]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedApprovedIds = useMemo(
    () => clips.filter((c) => selectedIds.has(c.id) && c.status === "approved").map((c) => c.id),
    [clips, selectedIds],
  );

  async function handleBulk(action: "approve" | "reject") {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await bulkUpdateClips(Array.from(selectedIds), action);
      showToast(action === "approve" ? "Cortes aprovados." : "Cortes rejeitados.", "success");
      clearSelection();
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro na ação em lote.", "error");
    } finally {
      setBulkLoading(false);
    }
  }

  const handleSingleDecision = useCallback(
    async (clip: Clip, status: "approved" | "rejected") => {
      try {
        await updateClip(clip.id, { status });
        showToast(status === "approved" ? "Corte aprovado." : "Corte rejeitado.", "success");
        load();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Erro ao registrar decisão.", "error");
      }
    },
    [load, showToast],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (detailClipId || publishClipIds.length > 0) return;
      if (isTypingTarget(e.target)) return;
      if (clips.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(clips.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        const clip = clips[focusedIndex];
        if (clip) handleSingleDecision(clip, "approved");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const clip = clips[focusedIndex];
        if (clip) handleSingleDecision(clip, "rejected");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clips, focusedIndex, detailClipId, publishClipIds, handleSingleDecision]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="clip-status-filter" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Status
        </label>
        <select
          id="clip-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ClipStatus | "")}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? CLIP_STATUS_LABELS[s] : "Todos"}
            </option>
          ))}
        </select>

        {jobIdFilter ? (
          <span className="flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200">
            Job: {jobIdFilter.slice(0, 8)}…
            <button type="button" onClick={() => router.replace(pathname)} className="font-semibold" aria-label="Remover filtro de job">
              ✕
            </button>
          </span>
        ) : null}

        <p className="ml-auto rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Atalhos: <kbd className="font-semibold">J</kbd>/<kbd className="font-semibold">K</kbd> navega ·{" "}
          <kbd className="font-semibold">A</kbd> aprova · <kbd className="font-semibold">R</kbd> rejeita
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {selectedIds.size} selecionado(s)
        </span>
        <button
          type="button"
          onClick={() => handleBulk("approve")}
          disabled={selectedIds.size === 0 || bulkLoading}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aprovar selecionados
        </button>
        <button
          type="button"
          onClick={() => handleBulk("reject")}
          disabled={selectedIds.size === 0 || bulkLoading}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Rejeitar selecionados
        </button>
        <button
          type="button"
          onClick={() => setPublishClipIds(selectedApprovedIds)}
          disabled={selectedApprovedIds.length === 0}
          className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          title={
            selectedApprovedIds.length === 0
              ? "Selecione cortes já aprovados para publicar"
              : undefined
          }
        >
          Publicar selecionados ({selectedApprovedIds.length})
        </button>
        {selectedIds.size > 0 ? (
          <button type="button" onClick={clearSelection} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
            Limpar seleção
          </button>
        ) : null}
      </div>

      <div aria-live="polite">
        {loading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : clips.length === 0 ? (
          <EmptyState
            title="Nenhum corte encontrado"
            description="Cortes aparecem aqui depois que um job de análise termina. Envie um vídeo e analise-o na tela de Upload."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {clips.map((clip, index) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                selected={selectedIds.has(clip.id)}
                focused={index === focusedIndex}
                onToggleSelect={() => toggleSelect(clip.id)}
                onOpenDetail={() => {
                  setFocusedIndex(index);
                  setDetailClipId(clip.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <ClipDetailDialog
        clipId={detailClipId}
        onClose={() => setDetailClipId(null)}
        onChanged={() => load()}
      />

      <PublishDialog
        clipIds={publishClipIds}
        onClose={() => setPublishClipIds([])}
        onPublished={() => {
          load();
        }}
      />
    </div>
  );
}
