import type { Metadata } from "next";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { RequireAdmin } from "@/components/admin/RequireAdmin";

export const metadata: Metadata = {
  title: "Usuários · Administração · Projetos Cortes",
};

export default function AdminUsuariosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Usuários</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gerencie contas, cotas e permissões de acesso ao painel.
        </p>
      </div>
      <RequireAdmin>
        <AdminUsersManager />
      </RequireAdmin>
    </div>
  );
}
