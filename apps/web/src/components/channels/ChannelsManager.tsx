"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import { PLATFORM_LABELS, PLATFORM_VALUES, type Channel, type ChannelInput, createChannel, deleteChannel, updateChannel } from "@/lib/channels";
import { PRESET_LABELS } from "@/lib/jobs";
import { ChannelForm } from "@/components/channels/ChannelForm";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

export function ChannelsManager() {
  const { channels, loading, error, reload } = useChannelContext();
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();
  const [formMode, setFormMode] = useState<"closed" | "create" | Channel>("closed");
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCreate(payload: ChannelInput) {
    await createChannel(payload);
    setFormMode("closed");
    showToast("Canal criado com sucesso.", "success");
    reload();
  }

  async function handleUpdate(id: string, payload: ChannelInput) {
    await updateChannel(id, payload);
    setFormMode("closed");
    showToast("Canal atualizado.", "success");
    reload();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteChannel(deleteTarget.id);
      showToast("Canal excluído.", "success");
      setDeleteTarget(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(
          "Este canal tem publicações agendadas. Cancele-as (na tela Publicações) antes de excluir o canal.",
        );
      } else {
        setDeleteError(err instanceof ApiError ? err.message : "Erro inesperado ao excluir o canal.");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {formMode === "closed" ? (
        <div>
          <button
            type="button"
            onClick={() => setFormMode("create")}
            className="btn btn-primary"
          >
            + Novo canal
          </button>
        </div>
      ) : (
        <ChannelForm
          channel={formMode === "create" ? undefined : formMode}
          onSubmit={(payload) => (formMode === "create" ? handleCreate(payload) : handleUpdate(formMode.id, payload))}
          onCancel={() => setFormMode("closed")}
        />
      )}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : channels.length === 0 ? (
        <EmptyState
          title="Nenhum canal cadastrado"
          description="Crie um canal para agrupar contas, presets padrão e template de publicação."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4"
            >
              <div className="flex items-center gap-2">
                <ChannelColorDot color={channel.color} />
                <h3 className="truncate text-base font-semibold text-fg">
                  {channel.name}
                </h3>
                {!channel.is_active ? (
                  <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs text-fg-subtle">
                    inativo
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-fg-subtle">
                {channel.niche || "sem nicho definido"} · preset{" "}
                {channel.default_preset ? PRESET_LABELS[channel.default_preset] : "não definido"}
                {showOwner ? ` · dono: ${ownerLabel(channel.owner_id)}` : ""}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_VALUES.map((platform) => {
                  const count = channel.counts.accounts_by_platform[platform] ?? 0;
                  return (
                    <span
                      key={platform}
                      title={PLATFORM_LABELS[platform]}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        count > 0
                          ? "border-success/40 bg-success-soft text-fg"
                          : "border-border bg-surface-2 text-fg-subtle"
                      }`}
                    >
                      {PLATFORM_LABELS[platform].split(" ")[0]}: {count}
                    </span>
                  );
                })}
              </div>

              <dl className="grid grid-cols-3 gap-2 text-sm text-fg-muted">
                <div>
                  <dt className="text-xs text-fg-subtle">Em revisão</dt>
                  <dd className="text-lg font-semibold tabular-nums text-fg">{channel.counts.clips_pending_review}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Agendados</dt>
                  <dd className="text-lg font-semibold tabular-nums text-fg">{channel.counts.publications_scheduled}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Publicados</dt>
                  <dd className="text-lg font-semibold tabular-nums text-fg">{channel.counts.publications_published}</dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setFormMode(channel)}
                  className="btn btn-secondary btn-sm"
                >
                  Editar
                </button>
                <Link
                  href={`/cortes/contas?channel_id=${channel.id}`}
                  className="btn btn-ghost btn-sm"
                >
                  Contas vinculadas
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(channel);
                  }}
                  className="btn btn-danger-outline btn-sm ml-auto"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Excluir canal">
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">
              Excluir o canal <span className="font-semibold">{deleteTarget.name}</span>? Esta ação não pode
              ser desfeita.
            </p>
            {deleteError ? (
              <p role="alert" className="text-sm text-danger">
                {deleteError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="btn btn-danger"
              >
                {deleting ? "Excluindo…" : "Excluir"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="btn btn-secondary"
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
