import { Icon, type IconName } from "@/components/ui/Icon";

type CalloutVariant = "info" | "warning" | "danger" | "success";

const STYLES: Record<CalloutVariant, { box: string; icon: IconName }> = {
  info: { box: "border-info/30 bg-info-soft text-fg", icon: "info" },
  warning: { box: "border-warning/40 bg-warning-soft text-fg", icon: "alert" },
  danger: { box: "border-danger/40 bg-danger-soft text-fg", icon: "alert" },
  success: { box: "border-success/30 bg-success-soft text-fg", icon: "checkCircle" },
};
const ICON_COLOR: Record<CalloutVariant, string> = {
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
};

/** Unified banner: license warning, "view as" notice, plan-ready, errors. */
export function Callout({
  variant = "info",
  title,
  children,
  action,
  role,
  className = "",
}: {
  variant?: CalloutVariant;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  const s = STYLES[variant];
  return (
    <div role={role} className={`flex gap-3 rounded-xl border p-4 text-sm ${s.box} ${className}`}>
      <Icon name={s.icon} className={`mt-0.5 ${ICON_COLOR[variant]}`} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-1 text-fg-muted" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
