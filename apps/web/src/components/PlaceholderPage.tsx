type PlaceholderPageProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function PlaceholderPage({
  title,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {description}
        </p>
      </div>
      {children}
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
        Em construção — esta página é um placeholder da Fase 0.
      </div>
    </div>
  );
}
