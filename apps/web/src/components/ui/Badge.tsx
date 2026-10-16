export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-border-strong bg-surface-2 text-fg-muted",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  info: "border-info/30 bg-info-soft text-info",
  primary: "border-primary/30 bg-primary-soft text-primary-text",
};

export function Badge({
  children,
  variant = "neutral",
  className = "",
  title,
  dot = false,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
  dot?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Generic status-badge factory: given a status -> label map and a status ->
 * variant map, returns a small component. Keeps per-domain badge components
 * (JobStatusBadge, ClipStatusBadge, ...) trivial one-liners. */
export function makeStatusBadge<S extends string>(
  labels: Record<S, string>,
  variants: Record<S, BadgeVariant>,
) {
  return function StatusBadgeComponent({ status }: { status: S }) {
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };
}
