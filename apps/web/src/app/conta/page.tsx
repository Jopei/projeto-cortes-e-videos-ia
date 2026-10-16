import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountManager } from "@/components/account/AccountManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Minha conta · Projetos Cortes",
};

export default function ContaPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Minha conta"
        description="Seus dados, uso de cotas e senha de acesso."
      />
      <Suspense fallback={null}>
        <AccountManager />
      </Suspense>
    </div>
  );
}
