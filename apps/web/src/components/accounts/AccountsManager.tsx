"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import {
  connectAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  listPlatforms,
  updateAccount,
  type PlatformAccount,
  type PlatformAccountUpdateInput,
  type PlatformInfo,
} from "@/lib/accounts";
import { PLATFORM_LABELS, type Channel, type PlatformValue } from "@/lib/channels";
import { useChannelContext } from "@/lib/channel-context";
import { AccountForm } from "@/components/accounts/AccountForm";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { AccountStatusBadge } from "@/components/ui/StatusBadges";
import { useToast } from "@/components/ui/Toast";

function channelName(channels: Channel[], id: string | null): string {
  if (!id) return "—";
  return channels.find((c) => c.id === id)?.name ?? id;
}

export function AccountsManager() {
  const { channels } = useChannelContext();
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addManualPlatform, setAddManualPlatform] = useState<PlatformValue | null>(null);
  const [manualDisplayName, setManualDisplayName] = useState("");
  const [manualChannelId, setManualChannelId] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<PlatformAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const channelFilter = searchParams.get("channel_id") ?? "";

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [platformsData, accountsData] = await Promise.all([
          listPlatforms(signal),
          listAccounts(channelFilter || undefined, signal),
        ]);
        setPlatforms(platformsData);
        setAccounts(accountsData);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar contas/plataformas.");
      } finally {
        setLoading(false);
      }
    },
    [channelFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Handle the OAuth callback redirect (?connected=<platform> / ?error=...).
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connected) {
      showToast(`Conta de ${PLATFORM_LABELS[connected as PlatformValue] ?? connected} conectada.`, "success");
      router.replace(pathname);
      load();
    } else if (oauthError) {
      showToast(`Erro ao conectar: ${oauthError}`, "error");
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleConnect(platform: PlatformInfo) {
    if (!platform.configured) {
      showToast(
        "Integração OAuth ainda não configurada — defina as credenciais no .env.",
        "error",
      );
      return;
    }
    try {
      const { authorize_url } = await connectAccount(platform.id);
      window.location.href = authorize_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        showToast(
          "Integração OAuth ainda não configurada — defina as credenciais no .env.",
          "error",
        );
      } else {
        showToast(err instanceof ApiError ? err.message : "Erro ao iniciar conexão.", "error");
      }
    }
  }

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!addManualPlatform) return;
    setManualError(null);
    setCreatingManual(true);
    try {
      await createAccount({
        platform: addManualPlatform,
        display_name: manualDisplayName,
        channel_id: manualChannelId || undefined,
      });
      showToast("Conta manual criada.", "success");
      setAddManualPlatform(null);
      setManualDisplayName("");
      setManualChannelId("");
      load();
    } catch (err) {
      setManualError(
        err instanceof ApiError && err.status === 409
          ? "Este canal já tem uma conta cadastrada para esta plataforma."
          : err instanceof ApiError
            ? err.message
            : "Erro ao criar conta manual.",
      );
    } finally {
      setCreatingManual(false);
    }
  }

  async function handleUpdateAccount(payload: PlatformAccountUpdateInput) {
    if (!editTarget) return;
    await updateAccount(editTarget.id, payload);
    showToast("Conta atualizada.", "success");
    setEditTarget(null);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAccount(deleteTarget.id);
      showToast("Conta excluída.", "success");
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao excluir conta.", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <SkeletonList rows={5} />;
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Plataformas</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <li
              key={platform.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900 dark:text-slate-50">{platform.name}</span>
                {platform.supports_oauth ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      platform.configured
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    }`}
                  >
                    {platform.configured ? "OAuth configurado" : "OAuth não configurado"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Somente manual
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{platform.notes}</p>
              <div className="mt-auto flex gap-3 pt-2 text-sm font-medium">
                {platform.supports_oauth ? (
                  <button
                    type="button"
                    onClick={() => handleConnect(platform)}
                    className="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Conectar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAddManualPlatform(platform.id)}
                  className="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Adicionar conta manual
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Contas cadastradas</h2>
          {channelFilter ? (
            <span className="flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200">
              Canal: {channelName(channels, channelFilter)}
              <button
                type="button"
                onClick={() => router.replace(pathname)}
                aria-label="Remover filtro de canal"
                className="font-semibold"
              >
                ✕
              </button>
            </span>
          ) : null}
        </div>
        {accounts.length === 0 ? (
          <EmptyState
            title="Nenhuma conta cadastrada"
            description="Conecte uma conta OAuth ou adicione uma conta manual (ex.: Bilibili) para publicar cortes."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <caption className="sr-only">Contas de plataformas cadastradas</caption>
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th scope="col" className={thClass}>Conta</th>
                  <th scope="col" className={thClass}>Plataforma</th>
                  <th scope="col" className={thClass}>Canal</th>
                  {showOwner ? <th scope="col" className={thClass}>Dono</th> : null}
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={thClass}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className={tdClass}>{account.display_name}</td>
                    <td className={tdClass}>{PLATFORM_LABELS[account.platform]}</td>
                    <td className={tdClass}>
                      <span className="flex items-center gap-1.5">
                        {account.channel_id ? (
                          <ChannelColorDot
                            color={channels.find((c) => c.id === account.channel_id)?.color ?? null}
                          />
                        ) : null}
                        {channelName(channels, account.channel_id)}
                      </span>
                    </td>
                    {showOwner ? <td className={tdClass}>{ownerLabel(account.owner_id)}</td> : null}
                    <td className={tdClass}>
                      <AccountStatusBadge status={account.status} />
                    </td>
                    <td className={`${tdClass} space-x-3 whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => setEditTarget(account)}
                        className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Editar
                      </button>
                      {(account.status === "expired" || account.status === "error") ? (
                        <button
                          type="button"
                          onClick={() => {
                            const info = platforms.find((p) => p.id === account.platform);
                            if (info) handleConnect(info);
                          }}
                          className="font-medium text-amber-600 hover:underline dark:text-amber-400"
                        >
                          Reconectar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(account)}
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
      </section>

      <Dialog
        open={addManualPlatform !== null}
        onClose={() => setAddManualPlatform(null)}
        title={addManualPlatform ? `Adicionar conta manual — ${PLATFORM_LABELS[addManualPlatform]}` : "Adicionar conta manual"}
      >
        <form onSubmit={handleCreateManual} className="flex flex-col gap-4">
          {manualError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {manualError}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="manual-display-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Nome de exibição
            </label>
            <input
              id="manual-display-name"
              required
              value={manualDisplayName}
              onChange={(e) => setManualDisplayName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="manual-channel" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Canal (opcional)
            </label>
            <select
              id="manual-channel"
              value={manualChannelId}
              onChange={(e) => setManualChannelId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
            >
              <option value="">Nenhum</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creatingManual}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingManual ? "Criando…" : "Criar conta"}
            </button>
            <button
              type="button"
              onClick={() => setAddManualPlatform(null)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Editar conta — ${editTarget.display_name}` : "Editar conta"}
        widthClassName="max-w-2xl"
      >
        {editTarget ? (
          <AccountForm
            account={editTarget}
            channels={channels}
            onSubmit={handleUpdateAccount}
            onCancel={() => setEditTarget(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Excluir conta">
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Excluir a conta <span className="font-semibold">{deleteTarget.display_name}</span>? Esta
              ação não pode ser desfeita.
            </p>
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

const thClass =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const tdClass = "px-4 py-3 text-slate-800 dark:text-slate-100";
