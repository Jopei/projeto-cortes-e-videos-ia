import type { SeriesProgress } from "@/lib/series";

/** 20-segment progress bar (spec §3). Segments are colored by aggregate status, and a
 * textual legend sits beside it so color is never the only signal. */
export function EpisodeProgressBar({ progress, total }: { progress: SeriesProgress; total: number }) {
  const done = progress.published + progress.scheduled + progress.approved;
  const waiting = progress.pending_review + progress.awaiting_script_approval;
  const failed = progress.failed;
  const segments: ("done" | "wait" | "fail" | "idle")[] = [];
  for (let i = 0; i < total; i++) {
    if (i < done) segments.push("done");
    else if (i < done + waiting) segments.push("wait");
    else if (i < done + waiting + failed) segments.push("fail");
    else segments.push("idle");
  }
  const color = {
    done: "bg-emerald-500",
    wait: "bg-amber-500",
    fail: "bg-red-500",
    idle: "bg-slate-200 dark:bg-slate-700",
  } as const;
  const label = `${done} de ${total} episódios aprovados, ${waiting} aguardando sua ação`;
  return (
    <div className="flex flex-col gap-1">
      <div role="img" aria-label={label} className="flex gap-0.5">
        {segments.map((kind, i) => (
          <span key={i} className={`h-2 flex-1 rounded-sm ${color[kind]}`} />
        ))}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300" aria-hidden="true">
        {done}/{total} aprovados · {progress.published} publicados
        {waiting > 0 ? ` · ${waiting} aguardando você` : ""}
        {failed > 0 ? ` · ${failed} com falha` : ""}
      </p>
    </div>
  );
}
