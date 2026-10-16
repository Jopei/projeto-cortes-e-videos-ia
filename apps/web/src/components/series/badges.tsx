import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import {
  ARC_PHASE_LABELS,
  CHARACTER_STATUS_LABELS,
  CHARACTER_STATUS_SYMBOLS,
  EPISODE_STATUS_LABELS,
  MEDIA_JOB_STATUS_LABELS,
  PAUSE_REASON_LABELS,
  SERIES_STATUS_LABELS,
  episodeNeedsAttention,
  type ArcPhase,
  type CharacterStatus,
  type EpisodeStatus,
  type MediaJobStatus,
  type PauseReason,
  type SeriesStatus,
} from "@/lib/series";

const SERIES_VARIANTS: Record<SeriesStatus, BadgeVariant> = {
  planning: "info",
  planned: "warning",
  plan_failed: "danger",
  active: "success",
  paused: "warning",
  completed: "success",
  canceled: "neutral",
};

const EPISODE_VARIANTS: Record<EpisodeStatus, BadgeVariant> = {
  planned: "neutral",
  scripting: "info",
  validating: "info",
  script_ready: "info",
  awaiting_script_approval: "warning",
  generating_media: "info",
  assembling: "info",
  pending_review: "warning",
  approved: "success",
  scheduled: "success",
  published: "success",
  rejected: "danger",
  needs_attention: "danger",
  stale: "warning",
  canceled: "neutral",
};

const JOB_VARIANTS: Record<MediaJobStatus, BadgeVariant> = {
  queued: "neutral",
  submitted: "info",
  running: "info",
  succeeded: "success",
  failed: "danger",
  canceled: "neutral",
};

const CHARACTER_VARIANTS: Record<CharacterStatus, BadgeVariant> = {
  alive: "success",
  injured: "warning",
  missing: "neutral",
  transformed: "info",
  dead: "danger",
};

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

export function SeriesStatusBadge({ status }: { status: SeriesStatus }) {
  return (
    <Badge variant={SERIES_VARIANTS[status] ?? "neutral"}>
      {status === "planning" ? <Spinner /> : null}
      {SERIES_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function EpisodeStatusBadge({ status }: { status: EpisodeStatus }) {
  const label = EPISODE_STATUS_LABELS[status] ?? status;
  const busy = label.endsWith("…");
  return (
    <Badge variant={EPISODE_VARIANTS[status] ?? "neutral"} title={episodeNeedsAttention(status) ? "Requer sua atenção" : undefined}>
      {busy ? <Spinner /> : null}
      {episodeNeedsAttention(status) ? <span className="sr-only">Requer atenção: </span> : null}
      {label}
    </Badge>
  );
}

export function ArcPhaseChip({ phase }: { phase: ArcPhase }) {
  return <Badge variant="neutral">{ARC_PHASE_LABELS[phase] ?? phase}</Badge>;
}

export function CharacterStatusBadge({ status }: { status: CharacterStatus }) {
  return (
    <Badge variant={CHARACTER_VARIANTS[status] ?? "neutral"} className={status === "missing" ? "border-dashed" : ""}>
      <span aria-hidden="true">{CHARACTER_STATUS_SYMBOLS[status]}</span>
      {CHARACTER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function MediaJobStatusBadge({ status }: { status: MediaJobStatus }) {
  return <Badge variant={JOB_VARIANTS[status] ?? "neutral"}>{MEDIA_JOB_STATUS_LABELS[status] ?? status}</Badge>;
}

export function AiBadge({ label = "IA" }: { label?: string }) {
  return (
    <Badge variant="info" title="Conteúdo gerado por inteligência artificial">
      <span aria-hidden="true">✦</span>
      {label}
    </Badge>
  );
}

export function PauseReasonNotice({ reason }: { reason: PauseReason | null }) {
  if (!reason) return null;
  return <span className="text-xs text-amber-700 dark:text-amber-300">{PAUSE_REASON_LABELS[reason] ?? reason}</span>;
}
