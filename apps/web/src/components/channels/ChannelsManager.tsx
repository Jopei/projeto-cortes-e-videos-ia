"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
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
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
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
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
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
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="flex items-center gap-2">
                <ChannelColorDot color={channel.color} />
                <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">
                  {channel.name}
                </h3>
                {!channel.is_active ? (
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                    inativo
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {channel.niche || "sem nicho definido"} · preset{" "}
                {channel.default_preset ? PRESET_LABELS[channel.default_preset] : "não definido"}
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
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                      }`}
                    >
                      {PLATFORM_LABELS[platform].split(" ")[0]}: {count}
                    </span>
                  );
                })}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
                <div>
                  <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Aguard. revisão</dt>
                  <dd className="font-medium">{channel.counts.clips_pending_review}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Agendados</dt>
                  <dd className="font-medium">{channel.counts.publications_scheduled}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Publicados</dt>
                  <dd className="font-medium">{channel.counts.publications_published}</dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap gap-3 pt-2 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setFormMode(channel)}
                  className="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Editar
                </button>
                <Link
                  href={`/cortes/contas?channel_id=${channel.id}`}
                  className="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Contas vinculadas
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(channel);
                  }}
                  className="text-red-600 hover:underline dark:text-red-400"
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
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Excluir o canal <span className="font-semibold">{deleteTarget.name}</span>? Esta ação não pode
              ser desfeita.
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
                {deleting ? "Excluindo…" : "Excluir"}
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
