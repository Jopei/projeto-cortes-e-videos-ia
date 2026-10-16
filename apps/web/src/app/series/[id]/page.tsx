import { Suspense } from "react";
import { SeriesDetailView } from "@/components/series/SeriesDetailView";

export default function SeriesDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<p className="text-sm text-fg-subtle">Carregando…</p>}>
        <SeriesDetailView seriesId={params.id} />
      </Suspense>
    </div>
  );
}
