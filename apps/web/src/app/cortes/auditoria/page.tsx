import { AuditLogManager } from "@/components/audit/AuditLogManager";

export default function AuditoriaPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Auditoria</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Histórico de ações relevantes do sistema (jobs, cortes, publicações, contas e canais).
        </p>
      </div>

      <AuditLogManager />
    </div>
  );
}
