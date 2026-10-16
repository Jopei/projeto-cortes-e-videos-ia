import {
  LICENSE_TYPE_LABELS,
  type LicenseType,
  type Source,
  isLicenseExpired,
  licenseRestrictionWarning,
} from "@/lib/sources";

/** Base badge for the license type itself (neutral/informational). */
export function LicenseTypeBadge({ licenseType }: { licenseType: LicenseType }) {
  if (licenseType === "ai_generated") {
    return (
      <span className="border-info/40 bg-info-soft text-fg inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
        <span aria-hidden="true">✦</span> {LICENSE_TYPE_LABELS[licenseType]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-muted">
      {LICENSE_TYPE_LABELS[licenseType]}
    </span>
  );
}

/** Extra warning badges: NC/ND usage restrictions and expired validity window. */
export function SourceWarningBadges({ source }: { source: Source }) {
  const restriction = licenseRestrictionWarning(source.license_type);
  const expired = isLicenseExpired(source);

  if (!restriction && !expired) return null;

  return (
    <>
      {restriction ? (
        <span
          role="status"
          className="border-warning/40 bg-warning-soft text-fg inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
        >
          <span aria-hidden="true">⚠</span> {restriction}
        </span>
      ) : null}
      {expired ? (
        <span
          role="status"
          className="border-danger/40 bg-danger-soft text-fg inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
        >
          <span aria-hidden="true">⚠</span> licença vencida
        </span>
      ) : null}
    </>
  );
}
