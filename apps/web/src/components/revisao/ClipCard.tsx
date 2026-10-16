"use client";

import { CLIP_STATUS_LABELS, SIGNAL_LABELS, SIGNAL_NAMES, clipThumbnailUrl, type Clip } from "@/lib/clips";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { ClipStatusBadge } from "@/components/ui/StatusBadges";
import { formatDuration } from "@/lib/tus";
import { AiBadge } from "@/components/series/badges";
import { Badge } from "@/components/ui/Badge";

function SignalBars({ signals }: { signals: Record<string, number> | null }) {
  if (!signals) return <p className="text-xs text-fg-subtle">Sem sinais.</p>;
  return (
    <div className="flex h-6 items-end gap-1" aria-hidden="true">
      {SIGNAL_NAMES.map((name) => {
        const value = Math.min(1, Math.max(0, signals[name] ?? 0));
        return (
          <div
            key={name}
            title={`${SIGNAL_LABELS[name]}: ${(value * 100).toFixed(0)}%`}
            className="w-2 rounded-sm bg-primary/70"
            style={{ height: `${Math.max(value * 100, 6)}%` }}
          />
        );
      })}
    </div>
  );
}

export function ClipCard({
  clip,
  selected,
  focused,
  onToggleSelect,
  onOpenDetail,
  onDecide,
}: {
  clip: Clip;
  selected: boolean;
  focused: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onDecide: (action: "approve" | "reject") => void;
}) {
  const duration = clip.end_s - clip.start_s;
  const isEpisode = !!clip.episode_id;
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  const scoreVariant = clip.score == null ? "neutral" : clip.score >= 0.8 ? "success" : clip.score >= 0.5 ? "warning" : "neutral";

  return (
    <li
      data-clip-card={clip.id}
      aria-current={focused ? "true" : undefined}
      className={`flex flex-row gap-3 rounded-xl border bg-surface p-3 shadow-card transition-shadow dark:shadow-none sm:flex-col ${
        focused ? "border-primary ring-2 ring-primary" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label="Ver detalhes do corte"
        className="group focus-ring relative aspect-[9/16] w-24 shrink-0 self-start overflow-hidden rounded-lg bg-border sm:w-full"
      >
        {clip.thumbnail_key ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated endpoint, next/image can't proxy cookies
          <img src={clipThumbnailUrl(clip.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-xs text-fg-subtle">
            {CLIP_STATUS_LABELS[clip.status]}
          </span>
        )}
        {isEpisode ? null : (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {formatDuration(duration)}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-2">
          <label className="flex min-h-[40px] items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={isEpisode ? `Selecionar episódio ${clip.episode_number ?? ""} da série` : `Selecionar corte de ${formatDuration(duration)}`}
              className="h-5 w-5 rounded border-border-strong accent-[rgb(var(--primary))]"
            />
            Selecionar
          </label>
          <ClipStatusBadge status={clip.status} />
        </div>

        {isEpisode || clip.synthetic_media ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {isEpisode ? <Badge variant="neutral">Série · Ep. {clip.episode_number ?? "?"}</Badge> : null}
            {clip.synthetic_media || isEpisode ? <AiBadge /> : null}
          </div>
        ) : null}

        {showOwner ? <p className="truncate text-xs text-fg-subtle">Dono: {ownerLabel(clip.owner_id)}</p> : null}

        <div className="flex items-center justify-between gap-2">
          {isEpisode ? (
            <span className="text-sm text-fg-muted">Episódio de série</span>
          ) : (
            <Badge variant={scoreVariant}>Score {clip.score != null ? clip.score.toFixed(2) : "—"}</Badge>
          )}
          {isEpisode ? null : <SignalBars signals={clip.signals} />}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {clip.status === "pending_review" ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onDecide("approve")} className="btn btn-success btn-sm">
                Aprovar
              </button>
              <button type="button" onClick={() => onDecide("reject")} className="btn btn-danger-outline btn-sm">
                Rejeitar
              </button>
            </div>
          ) : null}
          <button type="button" onClick={onOpenDetail} className="btn btn-ghost btn-sm">
            Ver detalhes
          </button>
        </div>
      </div>
    </li>
  );
}
