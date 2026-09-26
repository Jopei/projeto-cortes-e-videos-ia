import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export default function CortesOverviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Visão geral</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Resumo do pipeline de cortes: uploads, jobs em andamento, cortes aguardando revisão e
          publicações.
        </p>
      </div>

      <DashboardOverview />
    </div>
  );
}
