"use client";

import { CLIP_STATUS_LABELS, SIGNAL_LABELS, SIGNAL_NAMES, clipThumbnailUrl, type Clip } from "@/lib/clips";
import { ClipStatusBadge } from "@/components/ui/StatusBadges";
import { formatDuration } from "@/lib/tus";

function SignalBars({ signals }: { signals: Record<string, number> | null }) {
  if (!signals) return <p className="text-xs text-slate-400 dark:text-slate-600">Sem sinais.</p>;
  return (
    <div className="flex h-6 items-end gap-1" aria-hidden="true">
      {SIGNAL_NAMES.map((name) => {
        const value = Math.min(1, Math.max(0, signals[name] ?? 0));
        return (
          <div
            key={name}
            title={`${SIGNAL_LABELS[name]}: ${(value * 100).toFixed(0)}%`}
            className="w-2 rounded-sm bg-indigo-400 dark:bg-indigo-500"
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
}: {
  clip: Clip;
  selected: boolean;
  focused: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
}) {
  const duration = clip.end_s - clip.start_s;

  return (
    <li
      data-clip-card={clip.id}
      className={`flex flex-col gap-2 rounded-lg border bg-white p-3 dark:bg-slate-950 ${
        focused
          ? "border-indigo-500 ring-2 ring-indigo-500"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Selecionar corte de ${formatDuration(duration)}`}
            className="h-4 w-4 rounded border-slate-300"
          />
          Selecionar
        </label>
        <ClipStatusBadge status={clip.status} />
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className="group relative aspect-[9/16] w-full overflow-hidden rounded-md bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-slate-800"
      >
        {clip.thumbnail_key ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated endpoint, next/image can't proxy cookies
          <img
            src={clipThumbnailUrl(clip.id)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
            {CLIP_STATUS_LABELS[clip.status]}
          </span>
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(duration)}
        </span>
      </button>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Score: {clip.score != null ? clip.score.toFixed(2) : "—"}
        </span>
        <SignalBars signals={clip.signals} />
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className="text-left text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Ver detalhes
      </button>
    </li>
  );
}
