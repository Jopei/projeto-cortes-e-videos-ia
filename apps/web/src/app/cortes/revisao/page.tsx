import { Suspense } from "react";
import { RevisaoManager } from "@/components/revisao/RevisaoManager";

export default function RevisaoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Carregando…</p>}>
      <RevisaoManager />
    </Suspense>
  );
}
