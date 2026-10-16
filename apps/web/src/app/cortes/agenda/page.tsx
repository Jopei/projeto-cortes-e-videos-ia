import { AgendaManager } from "@/components/agenda/AgendaManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AgendaPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Agenda"
        description="Calendário semanal das publicações agendadas e já publicadas, coloridas pelo canal de origem."
      />

      <AgendaManager />
    </div>
  );
}
