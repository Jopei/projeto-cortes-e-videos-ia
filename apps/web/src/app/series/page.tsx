import { SeriesManager } from "@/components/series/SeriesManager";

export default function SeriesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Séries IA</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Histórias em 20 episódios de 30 s, geradas por IA. Você aprova o roteiro e o vídeo de cada episódio.
        </p>
      </div>
      <SeriesManager />
    </div>
  );
}
