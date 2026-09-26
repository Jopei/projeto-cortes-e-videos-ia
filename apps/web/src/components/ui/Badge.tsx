export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  success:
    "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning:
    "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200",
  danger:
    "border-red-400 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200",
  info: "border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-200",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
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
