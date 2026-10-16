import type { Metadata } from "next";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { RequireAdmin } from "@/components/admin/RequireAdmin";

export const metadata: Metadata = {
  title: "Usuários · Administração · Projetos Cortes",
};

export default function AdminUsuariosPage() {
  return (
    <RequireAdmin>
      <AdminUsersManager />
    </RequireAdmin>
  );
}
