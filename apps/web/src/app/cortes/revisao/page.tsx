import { Suspense } from "react";
import { RevisaoManager } from "@/components/revisao/RevisaoManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function RevisaoPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Revisão"
        description="Revise os cortes gerados, ajuste o recorte e os metadados de cada plataforma, e aprove ou rejeite antes de publicar."
      />

      <Suspense fallback={<p className="text-sm text-fg-subtle">Carregando…</p>}>
        <RevisaoManager />
      </Suspense>
    </div>
  );
}
