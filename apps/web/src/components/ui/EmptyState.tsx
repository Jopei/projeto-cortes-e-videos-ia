import { Icon, type IconName } from "@/components/ui/Icon";

/** Empty state with icon and (ideally) an action. `variant="inline"` is a
 * quiet one-liner for use inside dashboard cards. */
export function EmptyState({
  title,
  description,
  action,
  icon = "inbox",
  variant = "block",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: IconName;
  variant?: "block" | "inline";
}) {
  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-fg-muted">
        <span>{title}</span>
        {action}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary-text">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-base font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action}
    </div>
  );
}
