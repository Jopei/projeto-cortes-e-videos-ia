import { Suspense } from "react";
import { AccountsManager } from "@/components/accounts/AccountsManager";

export default function ContasPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Contas</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Conexão e gerenciamento das contas de destino (YouTube, TikTok, Bilibili, Instagram,
          Facebook) usadas para publicar os cortes.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}>
        <AccountsManager />
      </Suspense>
    </div>
  );
}
