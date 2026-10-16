import { SeriesWizard } from "@/components/series/SeriesWizard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NewSeriesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nova série"
        description="Descreva a ideia, escolha o estilo e veja a estimativa de custo antes de criar."
      />
      <SeriesWizard />
    </div>
  );
}
