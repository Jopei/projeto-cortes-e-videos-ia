import { SeriesWizard } from "@/components/series/SeriesWizard";

export default function NewSeriesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Nova série</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Descreva a ideia, escolha o estilo e veja a estimativa de custo antes de criar.
        </p>
      </div>
      <SeriesWizard />
    </div>
  );
}
