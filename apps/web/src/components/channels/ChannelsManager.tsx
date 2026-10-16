"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import { PLATFORM_LABELS, PLATFORM_VALUES, type Channel, type ChannelInput, createChannel, deleteChannel, updateChannel } from "@/lib/channels";
import { PRESET_LABELS } from "@/lib/jobs";
import { ChannelForm } from "@/components/channels/ChannelForm";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
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

  const PLATFORM_SHORT: Record<string, string> = { youtube: "YT", tiktok: "TT", bilibili: "BL", instagram: "IG", facebook: "FB", vimeo: "VM" };

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Canais"
        description="Canais agrupam contas de publicação, presets padrão de análise e template de texto. Um canal só pode ter uma conta por plataforma."
        actions={
          formMode === "closed" ? (
            <Button onClick={() => setFormMode("create")}>
              <Icon name="plus" size={16} /> Novo canal
            </Button>
          ) : null
        }
      />

      {formMode !== "closed" ? (
        <div className="mb-6">
          <ChannelForm
            channel={formMode === "create" ? undefined : formMode}
            onSubmit={(payload) => (formMode === "create" ? handleCreate(payload) : handleUpdate(formMode.id, payload))}
            onCancel={() => setFormMode("closed")}
          />
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <Callout variant="danger" role="alert" title="Não foi possível carregar os canais">
          {error}
        </Callout>
      ) : channels.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Crie seu primeiro canal"
          description="Crie um canal para agrupar contas, presets padrão e template de publicação."
          action={<Button onClick={() => setFormMode("create")}>Criar canal</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => {
            const connected = PLATFORM_VALUES.filter((p) => (channel.counts.accounts_by_platform[p] ?? 0) > 0);
            return (
              <li
                key={channel.id}
                style={{ borderTopColor: channel.color ?? "#94a3b8" }}
                className="flex flex-col gap-4 rounded-xl border border-t-4 border-border bg-surface p-4 shadow-card transition-shadow hover:border-border-strong hover:shadow-card-hover dark:shadow-none dark:ring-1 dark:ring-white/5 sm:p-5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <ChannelColorDot color={channel.color} />
                    <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{channel.name}</h3>
                    {!channel.is_active ? <Badge variant="neutral">inativo</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    {channel.niche || "Sem nicho definido"} · preset{" "}
                    {channel.default_preset ? PRESET_LABELS[channel.default_preset] : "não definido"}
                    {showOwner ? ` · dono: ${ownerLabel(channel.owner_id)}` : ""}
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-fg-subtle">
                    Contas conectadas ({connected.length}/{PLATFORM_VALUES.length})
                  </p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Plataformas deste canal">
                    {PLATFORM_VALUES.map((platform) => {
                      const on = (channel.counts.accounts_by_platform[platform] ?? 0) > 0;
                      return (
                        <li
                          key={platform}
                          title={`${PLATFORM_LABELS[platform]}: ${on ? "conta conectada" : "sem conta"}`}
                          className={`flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-1.5 text-xs font-semibold ${
                            on
                              ? "border-success/40 bg-success-soft text-success"
                              : "border-border bg-surface-2 text-fg-subtle"
                          }`}
                        >
                          {PLATFORM_SHORT[platform]}
                          <span className="sr-only">
                            {" "}
                            {PLATFORM_LABELS[platform]}: {on ? "conta conectada" : "sem conta"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-sm">
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

                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setFormMode(channel)}>
                    Editar<span className="sr-only"> {channel.name}</span>
                  </Button>
                  <Button variant="ghost" size="sm" href={`/cortes/contas?channel_id=${channel.id}`}>
                    Contas<span className="sr-only"> de {channel.name}</span>
                  </Button>
                  <span className="ml-auto">
                    <MoreMenu
                      label={channel.name}
                      items={[
                        {
                          label: "Excluir canal",
                          danger: true,
                          onSelect: () => {
                            setDeleteError(null);
                            setDeleteTarget(channel);
                          },
                        },
                      ]}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir canal"
        confirmLabel="Excluir"
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        Excluir o canal <span className="font-semibold text-fg">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  );
}
