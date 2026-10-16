"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { seriesErrorMessage } from "@/lib/series-errors";
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
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const [helpOpen, setHelpOpen] = useState(false);
  // Optimistic decisions waiting out the "Desfazer" grace period (the API has no way to revert a decision).
  const [overrides, setOverrides] = useState<Map<string, "approved" | "rejected">>(new Map());
  const pendingRef = useRef(new Map<string, { ids: string[]; action: "approve" | "reject"; timer: number }>());

  const load = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) setLoading(true);
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
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Clips as shown: optimistic decisions applied; decided clips leave a status-filtered list.
  const visibleClips = useMemo(
    () =>
      clips
        .map((c) => (overrides.has(c.id) ? { ...c, status: overrides.get(c.id)! } : c))
        .filter((c) => !statusFilter || c.status === statusFilter),
    [clips, overrides, statusFilter],
  );

  useEffect(() => {
    setFocusedIndex((i) => Math.min(i, Math.max(0, visibleClips.length - 1)));
  }, [visibleClips.length]);

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
    () => visibleClips.filter((c) => selectedIds.has(c.id) && c.status === "approved").map((c) => c.id),
    [visibleClips, selectedIds],
  );

  const dropOverrides = useCallback((ids: string[]) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const commit = useCallback(
    async (key: string) => {
      const entry = pendingRef.current.get(key);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      pendingRef.current.delete(key);
      try {
        if (entry.ids.length === 1) {
          await updateClip(entry.ids[0], { status: entry.action === "approve" ? "approved" : "rejected" });
        } else {
          await bulkUpdateClips(entry.ids, entry.action);
        }
      } catch (err) {
        showToast(seriesErrorMessage(err, "Erro ao registrar decisão."), "error");
      } finally {
        dropOverrides(entry.ids);
        void load(undefined, true);
      }
    },
    [dropOverrides, load, showToast],
  );

  /** Applies the decision on screen right away, and only sends it to the API after the undo window. */
  const decide = useCallback(
    (ids: string[], action: "approve" | "reject") => {
      if (ids.length === 0) return;
      const status = action === "approve" ? "approved" : "rejected";
      const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setOverrides((prev) => {
        const next = new Map(prev);
        ids.forEach((id) => next.set(id, status));
        return next;
      });
      const timer = window.setTimeout(() => void commit(key), 6000);
      pendingRef.current.set(key, { ids, action, timer });
      const noun = ids.length === 1 ? "Corte" : `${ids.length} cortes`;
      showToast(`${noun} ${action === "approve" ? (ids.length === 1 ? "aprovado" : "aprovados") : ids.length === 1 ? "rejeitado" : "rejeitados"}.`, "success", {
        duration: 5500,
        action: {
          label: "Desfazer",
          onClick: () => {
            const entry = pendingRef.current.get(key);
            if (!entry) return;
            window.clearTimeout(entry.timer);
            pendingRef.current.delete(key);
            dropOverrides(ids);
          },
        },
      });
    },
    [commit, dropOverrides, showToast],
  );

  // Leaving the screen must not lose decisions still inside the undo window.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      Array.from(pending.keys()).forEach((k) => void commit(k));
    };
  }, [commit]);

  function handleBulk(action: "approve" | "reject") {
    if (selectedIds.size === 0) return;
    decide(Array.from(selectedIds), action);
    clearSelection();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (detailClipId || publishClipIds.length > 0 || helpOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (visibleClips.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(visibleClips.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        const clip = visibleClips[focusedIndex];
        if (clip && clip.status === "pending_review") decide([clip.id], "approve");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const clip = visibleClips[focusedIndex];
        if (clip && clip.status === "pending_review") decide([clip.id], "reject");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleClips, focusedIndex, detailClipId, publishClipIds, helpOpen, decide]);

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Revisão"
        description="Revise os cortes gerados, ajuste o recorte e os metadados de cada plataforma, e aprove ou rejeite antes de publicar."
      />

      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:top-0 lg:-mx-8 lg:px-8">
        {hasSelection ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ações em lote">
            <span className="mr-1 text-sm font-semibold text-fg tabular-nums">
              {selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}
            </span>
            <Button variant="success" size="sm" onClick={() => handleBulk("approve")}>
              <Icon name="check" size={16} /> Aprovar
            </Button>
            <Button variant="danger-outline" size="sm" onClick={() => handleBulk("reject")}>
              <Icon name="x" size={16} /> Rejeitar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setPublishClipIds(selectedApprovedIds)}
              disabled={selectedApprovedIds.length === 0}
              title={selectedApprovedIds.length === 0 ? "Selecione cortes já aprovados para publicar" : undefined}
            >
              <Icon name="send" size={16} /> Publicar ({selectedApprovedIds.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="ml-auto">
              Limpar seleção
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="clip-status-filter" className="text-sm font-medium text-fg">
              Status
            </label>
            <select
              id="clip-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ClipStatus | "")}
              className="field-control"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s ? CLIP_STATUS_LABELS[s] : "Todos"}
                </option>
              ))}
            </select>

            {jobIdFilter ? (
              <span className="flex items-center gap-1 rounded-full border border-info/40 bg-info-soft py-0.5 pl-3 pr-1 text-xs text-fg">
                Job: {jobIdFilter.slice(0, 8)}…
                <button
                  type="button"
                  onClick={() => router.replace(pathname)}
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2"
                  aria-label="Remover filtro de job"
                >
                  <Icon name="x" size={14} />
                </button>
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="focus-ring ml-auto hidden items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary-text md:inline-flex"
            >
              <Icon name="keyboard" size={16} />
              <span>
                <kbd className="font-semibold">J</kbd>/<kbd className="font-semibold">K</kbd> navegar ·{" "}
                <kbd className="font-semibold">A</kbd> aprovar · <kbd className="font-semibold">R</kbd> rejeitar
              </span>
              <span className="sr-only">Ver atalhos de teclado</span>
              <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-semibold">?</span>
            </button>
          </div>
        )}
      </div>

      <div aria-live="polite">
        {loading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <Callout variant="danger" role="alert" title="Não foi possível carregar os cortes" action={<Button variant="secondary" size="sm" onClick={() => void load()}>Tentar de novo</Button>}>
            {error}
          </Callout>
        ) : visibleClips.length === 0 ? (
          <EmptyState
            icon="review"
            title="Nada para revisar agora"
            description="Cortes aparecem aqui depois que um job de análise termina. Envie um vídeo e analise-o na tela de Upload."
            action={<Button href="/cortes/upload">Enviar um vídeo</Button>}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleClips.map((clip, index) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                selected={selectedIds.has(clip.id)}
                focused={index === focusedIndex}
                onToggleSelect={() => toggleSelect(clip.id)}
                onDecide={(action) => decide([clip.id], action)}
                onOpenDetail={() => {
                  setFocusedIndex(index);
                  setDetailClipId(clip.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Atalhos de teclado">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
          {[
            ["J", "Próximo corte"],
            ["K", "Corte anterior"],
            ["A", "Aprovar o corte em foco (com Desfazer)"],
            ["R", "Rejeitar o corte em foco (com Desfazer)"],
            ["Ctrl K", "Buscar tela"],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-xs font-semibold text-fg">{k}</kbd>
              </dt>
              <dd className="text-fg-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Dialog>

      <ClipDetailDialog
        clipId={detailClipId}
        onClose={() => setDetailClipId(null)}
        onChanged={() => load()}
      />

      <PublishDialog
        clipIds={publishClipIds}
        onClose={() => setPublishClipIds([])}
        onPublished={() => {
          void load();
        }}
      />
    </div>
  );
}
