import { AgendaManager } from "@/components/agenda/AgendaManager";

export default function AgendaPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Agenda</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Calendário semanal das publicações agendadas e já publicadas, coloridas pelo canal de
          origem.
        </p>
      </div>

      <AgendaManager />
    </div>
  );
}
