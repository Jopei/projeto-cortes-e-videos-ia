import { Suspense } from "react";
import { AccountsManager } from "@/components/accounts/AccountsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ContasPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Contas"
        description="Conexão e gerenciamento das contas de destino (YouTube, TikTok, Bilibili, Instagram, Facebook) usadas para publicar os cortes."
      />

      <Suspense fallback={<p className="text-sm text-fg-subtle">Carregando…</p>}>
        <AccountsManager />
      </Suspense>
    </div>
  );
}
