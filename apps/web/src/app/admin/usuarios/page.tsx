import type { Metadata } from "next";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { RequireAdmin } from "@/components/admin/RequireAdmin";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Usuários · Administração · Projetos Cortes",
};

export default function AdminUsuariosPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Usuários"
        description="Gerencie contas, cotas e permissões de acesso ao painel."
      />
      <RequireAdmin>
        <AdminUsersManager />
      </RequireAdmin>
    </div>
  );
}
