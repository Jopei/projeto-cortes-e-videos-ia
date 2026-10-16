import { AuditLogManager } from "@/components/audit/AuditLogManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AuditoriaPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Auditoria"
        description="Histórico de ações relevantes do sistema (jobs, cortes, publicações, contas e canais)."
      />

      <AuditLogManager />
    </div>
  );
}
