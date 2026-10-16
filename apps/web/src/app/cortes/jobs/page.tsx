import { JobsManager } from "@/components/jobs/JobsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function JobsPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Jobs"
        description="Fila e status dos processamentos de corte (detecção de cenas, legendas, renderização vertical) para cada vídeo enviado."
      />

      <JobsManager />
    </div>
  );
}
