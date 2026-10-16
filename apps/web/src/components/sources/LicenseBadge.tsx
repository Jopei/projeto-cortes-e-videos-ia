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
      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-200">
        <span aria-hidden="true">✦</span> {LICENSE_TYPE_LABELS[licenseType]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
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
          className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span aria-hidden="true">⚠</span> {restriction}
        </span>
      ) : null}
      {expired ? (
        <span
          role="status"
          className="inline-flex items-center gap-1 rounded-full border border-red-400 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
        >
          <span aria-hidden="true">⚠</span> licença vencida
        </span>
      ) : null}
    </>
  );
}
