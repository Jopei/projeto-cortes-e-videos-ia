import { SeriesManager } from "@/components/series/SeriesManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export default function SeriesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Séries IA"
        description="Histórias em 20 episódios de 30 s, geradas por IA. Você aprova o roteiro e o vídeo de cada episódio."
          actions={<Button href="/series/nova"><Icon name="plus" size={16} /> Nova série</Button>}
      />
      <SeriesManager />
    </div>
  );
}
