"use client";

import { formatUsd } from "@/lib/format";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  type AdminUserCreateInput,
  type AdminUserRead,
  type AdminUserUpdateInput,
  createAdminUser,
  deleteAdminUser,
  displayNameOf,
  resetAdminUserPassword,
  updateAdminUser,
} from "@/lib/admin-users";
import { useAdminView } from "@/lib/admin-view";
import { generateStrongPassword } from "@/lib/password";
import { formatBytes } from "@/lib/tus";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { UsageBar } from "@/components/ui/UsageBar";
import { UserFormDialog } from "@/components/admin/UserFormDialog";

const thClass =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const tdClass = "px-4 py-3 align-top text-slate-800 dark:text-slate-100";

export function AdminUsersManager() {
  const { users, loadingUsers, reloadUsers } = useAdminView();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRead | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCreate(payload: AdminUserCreateInput) {
    await createAdminUser(payload);
    setCreating(false);
    showToast("Usuário criado.", "success");
    reloadUsers();
  }

  async function handleUpdate(payload: AdminUserUpdateInput) {
    if (!editTarget) return;
    await updateAdminUser(editTarget.id, payload);
    setEditTarget(null);
    showToast("Usuário atualizado.", "success");
    reloadUsers();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminUser(deleteTarget.id);
      showToast("Usuário removido (ou desativado, se ainda tinha dados).", "success");
      setDeleteTarget(null);
      reloadUsers();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(
          "Não é possível excluir: isso deixaria o sistema sem nenhum administrador ativo, ou você está tentando excluir sua própria conta.",
        );
      } else {
        setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado ao excluir o usuário.");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          + Novo usuário
        </button>
      </div>

      {loadingUsers ? (
        <SkeletonList rows={4} />
      ) : users.length === 0 ? (
        <EmptyState title="Nenhum usuário cadastrado" description="Crie o primeiro usuário do sistema." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <caption className="sr-only">Usuários do sistema</caption>
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th scope="col" className={thClass}>Usuário</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Armazenamento</th>
                <th scope="col" className={thClass}>Análises hoje</th>
                <th scope="col" className={thClass}>Canais</th>
                <th scope="col" className={thClass}>Séries IA ativas</th>
                <th scope="col" className={thClass}>IA no mês</th>
                <th scope="col" className={thClass}>Cortes / Publicações</th>
                <th scope="col" className={thClass}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={tdClass}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{displayNameOf(u)}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{u.username}</span>
                      {u.email ? <span className="text-xs text-slate-500 dark:text-slate-400">{u.email}</span> : null}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1.5">
                      {u.is_admin ? <Badge variant="info">Admin</Badge> : null}
                      <Badge variant={u.is_active ? "success" : "neutral"}>{u.is_active ? "Ativo" : "Inativo"}</Badge>
                      {u.must_change_password ? <Badge variant="warning">Troca de senha pendente</Badge> : null}
                    </div>
                  </td>
                  <td className={`${tdClass} min-w-[10rem]`}>
                    {u.is_admin ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">sem limite</span>
                    ) : (
                      <UsageBar
                        label=""
                        used={u.usage.storage_used_bytes}
                        quota={u.usage.storage_quota_bytes}
                        formatValue={(v) => formatBytes(v)}
                      />
                    )}
                  </td>
                  <td className={tdClass}>
                    {u.is_admin ? "—" : `${u.usage.analyses_today}${u.usage.daily_analysis_quota != null ? ` / ${u.usage.daily_analysis_quota}` : ""}`}
                  </td>
                  <td className={tdClass}>
                    {u.is_admin ? "—" : `${u.usage.channels_count}${u.usage.max_channels != null ? ` / ${u.usage.max_channels}` : ""}`}
                  </td>
                  <td className={tdClass}>
                    {u.is_admin ? "—" : `${u.usage.active_series ?? 0}${u.usage.max_active_series != null ? ` / ${u.usage.max_active_series}` : ""}`}
                  </td>
                  <td className={tdClass}>
                    {formatUsd(u.usage.ai_spend_month_usd ?? 0)}
                    {!u.is_admin && u.usage.monthly_ai_budget_usd != null ? ` / ${formatUsd(u.usage.monthly_ai_budget_usd)}` : ""}
                  </td>
                  <td className={tdClass}>
                    {u.clips_count} / {u.publications_count}
                  </td>
                  <td className={`${tdClass} space-x-3 whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => setEditTarget(u)}
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetTarget(u)}
                      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Redefinir senha
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(u);
                      }}
                      className="font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? <UserFormDialog mode="create" onSubmit={handleCreate} onClose={() => setCreating(false)} /> : null}

      {editTarget ? (
        <UserFormDialog mode="edit" user={editTarget} onSubmit={handleUpdate} onClose={() => setEditTarget(null)} />
      ) : null}

      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Excluir usuário">
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Excluir <span className="font-semibold">{displayNameOf(deleteTarget)}</span>? Se o usuário já tiver
              dados (fontes, uploads, canais, cortes, contas ou publicações), ele será apenas{" "}
              <span className="font-semibold">desativado</span> em vez de excluído — os dados nunca são apagados
              silenciosamente.
            </p>
            {deleteError ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Processando…" : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function ResetPasswordDialog({ target, onClose }: { target: AdminUserRead | null; onClose: () => void }) {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate a fresh temporary password whenever a new target is opened.
  useEffect(() => {
    if (target) {
      setPassword(generateStrongPassword());
      setError(null);
    }
  }, [target]);

  async function handleConfirm() {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetAdminUserPassword(target.id, password);
      showToast(`Senha de ${displayNameOf(target)} redefinida. Repasse a nova senha com segurança.`, "success");
      setPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado ao redefinir a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      showToast("Senha copiada.", "success");
    } catch {
      showToast("Não foi possível copiar — selecione o texto manualmente.", "error");
    }
  }

  return (
    <Dialog
      open={target !== null}
      onClose={() => {
        setPassword("");
        setError(null);
        onClose();
      }}
      title={target ? `Redefinir senha — ${displayNameOf(target)}` : "Redefinir senha"}
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Uma nova senha temporária foi gerada. O usuário precisará trocá-la no próximo login.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={password}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
            />
            <button
              type="button"
              onClick={() => setPassword(generateStrongPassword())}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Gerar outra
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Copiar
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Salvando…" : "Confirmar redefinição"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPassword("");
                setError(null);
                onClose();
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
