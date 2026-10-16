import { Suspense } from "react";
import { SeriesDetailView } from "@/components/series/SeriesDetailView";

export default function SeriesDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Suspense fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}>
        <SeriesDetailView seriesId={params.id} />
      </Suspense>
    </div>
  );
}
