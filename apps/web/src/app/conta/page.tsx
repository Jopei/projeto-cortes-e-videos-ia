import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountManager } from "@/components/account/AccountManager";

export const metadata: Metadata = {
  title: "Minha conta · Projetos Cortes",
};

export default function ContaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Minha conta</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Seus dados, uso de cotas e senha de acesso.
        </p>
      </div>
      <Suspense fallback={null}>
        <AccountManager />
      </Suspense>
    </div>
  );
}
