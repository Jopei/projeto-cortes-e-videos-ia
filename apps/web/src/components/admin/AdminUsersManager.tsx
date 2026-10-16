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
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { UsageBar } from "@/components/ui/UsageBar";
import { UserFormDialog } from "@/components/admin/UserFormDialog";


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

  const columns: Column<AdminUserRead>[] = [
    {
      id: "user",
      header: "Usuário",
      primary: true,
      cell: (u) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-fg">{displayNameOf(u)}</span>
          <span className="text-xs font-normal text-fg-subtle">
            {u.username}
            {u.email ? ` · ${u.email}` : ""}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Papel e status",
      cell: (u) => (
        <div className="flex flex-wrap gap-1.5">
          {u.is_admin ? <Badge variant="primary">Admin</Badge> : <Badge variant="neutral">Usuário</Badge>}
          <Badge variant={u.is_active ? "success" : "neutral"} dot>
            {u.is_active ? "Ativo" : "Inativo"}
          </Badge>
          {u.must_change_password ? <Badge variant="warning">Troca de senha pendente</Badge> : null}
        </div>
      ),
    },
    {
      id: "usage",
      header: "Uso",
      className: "min-w-[14rem]",
      cell: (u) => (
        <div className="flex flex-col gap-1.5">
          {u.is_admin ? (
            <span className="text-xs text-fg-subtle">Armazenamento sem limite</span>
          ) : (
            <UsageBar
              label="Armazenamento"
              used={u.usage.storage_used_bytes}
              quota={u.usage.storage_quota_bytes}
              formatValue={(v) => formatBytes(v)}
            />
          )}
          <p className="text-xs text-fg-subtle">
            {u.is_admin
              ? `IA no mês: ${formatUsd(u.usage.ai_spend_month_usd ?? 0)}`
              : `Análises hoje ${u.usage.analyses_today}${u.usage.daily_analysis_quota != null ? `/${u.usage.daily_analysis_quota}` : ""} · Canais ${u.usage.channels_count}${u.usage.max_channels != null ? `/${u.usage.max_channels}` : ""} · Séries ativas ${u.usage.active_series ?? 0}${u.usage.max_active_series != null ? `/${u.usage.max_active_series}` : ""} · IA no mês ${formatUsd(u.usage.ai_spend_month_usd ?? 0)}${u.usage.monthly_ai_budget_usd != null ? `/${formatUsd(u.usage.monthly_ai_budget_usd)}` : ""}`}
          </p>
        </div>
      ),
    },
    { id: "content", header: "Cortes / Publicações", numeric: true, cell: (u) => `${u.clips_count} / ${u.publications_count}` },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Usuários"
        description="Gerencie contas, cotas e permissões de acesso ao painel."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> Novo usuário
          </Button>
        }
      />

      {loadingUsers ? (
        <SkeletonList rows={4} />
      ) : users.length === 0 ? (
        <EmptyState
          icon="users"
          title="Nenhum usuário cadastrado"
          description="Crie o primeiro usuário do sistema."
          action={<Button onClick={() => setCreating(true)}>Novo usuário</Button>}
        />
      ) : (
        <DataTable
          caption="Usuários do sistema"
          columns={columns}
          rows={users}
          rowKey={(u) => u.id}
          actions={(u) => (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditTarget(u)}>
                Editar<span className="sr-only"> {displayNameOf(u)}</span>
              </Button>
              <MoreMenu
                label={displayNameOf(u)}
                items={[
                  { label: "Redefinir senha", onSelect: () => setResetTarget(u) },
                  {
                    label: "Excluir",
                    danger: true,
                    onSelect: () => {
                      setDeleteError(null);
                      setDeleteTarget(u);
                    },
                  },
                ]}
              />
            </>
          )}
        />
      )}

      {creating ? <UserFormDialog mode="create" onSubmit={handleCreate} onClose={() => setCreating(false)} /> : null}

      {editTarget ? (
        <UserFormDialog mode="edit" user={editTarget} onSubmit={handleUpdate} onClose={() => setEditTarget(null)} />
      ) : null}

      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir usuário"
        confirmLabel="Confirmar"
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        {deleteTarget ? (
          <>
            Excluir <span className="font-semibold text-fg">{displayNameOf(deleteTarget)}</span>? Se o usuário já tiver
            dados (fontes, uploads, canais, cortes, contas ou publicações), ele será apenas{" "}
            <span className="font-semibold text-fg">desativado</span> em vez de excluído — os dados nunca são apagados
            silenciosamente.
          </>
        ) : null}
      </ConfirmDialog>
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
          <p className="text-sm text-fg-muted">
            Uma nova senha temporária foi gerada. O usuário precisará trocá-la no próximo login.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={password}
              className="field-control w-full font-mono"
            />
            <button
              type="button"
              onClick={() => setPassword(generateStrongPassword())}
              className="btn btn-secondary btn-sm shrink-0"
            >
              Gerar outra
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-secondary btn-sm shrink-0"
            >
              Copiar
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="btn btn-primary"
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
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
