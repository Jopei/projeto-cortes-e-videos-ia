export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-950">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
