import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default function EncurtadoresPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Encurtadores"
        description="Encurtador de links próprio, planejado como segundo projeto desta plataforma."
      />
      <EmptyState
        icon="link"
        title="Em breve"
        description="Esta área ainda não está disponível. Avisaremos aqui quando o encurtador estiver pronto."
      />
    </div>
  );
}
