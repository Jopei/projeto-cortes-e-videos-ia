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
        <h1 className="text-2xl font-semibold text-fg">
          {title}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {description}
        </p>
      </div>
      {children}
      <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
        Em construção — esta página é um placeholder da Fase 0.
      </div>
    </div>
  );
}
