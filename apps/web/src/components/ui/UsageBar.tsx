import { usageRatio } from "@/lib/me";

/** Shared "usado/cota" bar — used by /conta and the admin users table.
 * `null` quota renders as "sem limite" with no bar (admins, or a user with
 * an explicitly unlimited quota). */
export function UsageBar({
  label,
  used,
  quota,
  formatValue,
}: {
  label: string;
  used: number;
  quota: number | null;
  formatValue: (value: number) => string;
}) {
  const ratio = usageRatio(used, quota);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-fg-muted tabular-nums">
        <span>{label}</span>
        <span>{quota === null ? `${formatValue(used)} (sem limite)` : `${formatValue(used)} / ${formatValue(quota)}`}</span>
      </div>
      {ratio !== null ? (
        <div
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          className="h-2 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className={`h-full rounded-full ${ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
