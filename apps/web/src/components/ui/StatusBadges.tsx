import { makeStatusBadge } from "@/components/ui/Badge";
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/accounts";
import { CLIP_STATUS_LABELS, type ClipStatus } from "@/lib/clips";
import { JOB_STATUS_LABELS, type AnalysisJobStatus } from "@/lib/jobs";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/publications";

export const JobStatusBadge = makeStatusBadge<AnalysisJobStatus>(JOB_STATUS_LABELS, {
  queued: "neutral",
  running: "info",
  done: "success",
  failed: "danger",
  canceled: "neutral",
});

export const ClipStatusBadge = makeStatusBadge<ClipStatus>(CLIP_STATUS_LABELS, {
  rendering: "info",
  pending_review: "warning",
  approved: "success",
  rejected: "danger",
  failed: "danger",
});

export const PublicationStatusBadge = makeStatusBadge<PublicationStatus>(PUBLICATION_STATUS_LABELS, {
  blocked: "danger",
  scheduled: "info",
  publishing: "info",
  published: "success",
  failed: "danger",
  canceled: "neutral",
  taken_down: "warning",
  exported: "neutral",
});

export const AccountStatusBadge = makeStatusBadge<AccountStatus>(ACCOUNT_STATUS_LABELS, {
  connected: "success",
  expired: "warning",
  error: "danger",
  manual: "neutral",
});
