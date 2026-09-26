import { Suspense } from "react";
import { RevisaoManager } from "@/components/revisao/RevisaoManager";

export default function RevisaoPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Revisão</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Revise os cortes gerados, ajuste o recorte e os metadados de cada plataforma, e aprove ou
          rejeite antes de publicar.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}>
        <RevisaoManager />
      </Suspense>
    </div>
  );
}
