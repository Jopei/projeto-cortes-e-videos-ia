import { JobsManager } from "@/components/jobs/JobsManager";

export default function JobsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Jobs</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Fila e status dos processamentos de corte (detecção de cenas, legendas, renderização
          vertical) para cada vídeo enviado.
        </p>
      </div>

      <JobsManager />
    </div>
  );
}
