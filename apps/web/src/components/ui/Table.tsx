/** Table shell: card surface, horizontal scroll fallback, standard header/rows.
 * For mobile-first lists prefer rendering cards below `md` and <Table> from `md`. */
export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none ${className}`}>
      <table className="w-full min-w-full border-collapse text-sm tabular-nums">{children}</table>
    </div>
  );
}

export const TH_CLASS = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-subtle";
export const TD_CLASS = "px-4 py-3 align-middle text-fg-muted";
export const THEAD_CLASS = "bg-surface-2";
export const TR_CLASS = "border-t border-border hover:bg-surface-2/60";
