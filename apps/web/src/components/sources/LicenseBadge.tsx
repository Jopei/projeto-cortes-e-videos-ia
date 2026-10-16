import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import {
  LICENSE_TYPE_LABELS,
  type LicenseType,
  type Source,
  isLicenseExpired,
  licenseRestrictionWarning,
} from "@/lib/sources";

const LICENSE_VARIANT: Record<LicenseType, BadgeVariant> = {
  public_domain: "success",
  cc_by: "success",
  cc_by_sa: "success",
  own: "success",
  licensed: "info",
  cc_by_nc: "warning",
  cc_by_nd: "danger",
  ai_generated: "primary",
};

/** Base badge for the license type itself, colored by risk (NC warning, ND danger). */
export function LicenseTypeBadge({ licenseType }: { licenseType: LicenseType }) {
  return (
    <Badge variant={LICENSE_VARIANT[licenseType]}>
      {licenseType === "ai_generated" ? <Icon name="sparkles" size={12} /> : null}
      {LICENSE_TYPE_LABELS[licenseType]}
    </Badge>
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
        <span role="status">
          <Badge variant="warning">
            <Icon name="alert" size={12} /> {restriction}
          </Badge>
        </span>
      ) : null}
      {expired ? (
        <span role="status">
          <Badge variant="danger">
            <Icon name="alert" size={12} /> licença vencida
          </Badge>
        </span>
      ) : null}
    </>
  );
}
