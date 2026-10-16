"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { useAuth } from "@/lib/user-context";
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
import { listIntegrations, type Integration, type IntegrationId } from "@/lib/integrations";
import { INTEGRATION_HELP } from "@/lib/integration-help";
import { PLATFORM_LABELS, type Channel, type PlatformValue } from "@/lib/channels";
import { useChannelContext } from "@/lib/channel-context";
import { AccountForm } from "@/components/accounts/AccountForm";
import { IntegrationKeysDialog } from "@/components/accounts/IntegrationKeysDialog";
import { PlatformHelpPopover } from "@/components/accounts/PlatformHelpPopover";
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

const AI_INTEGRATION_CARDS: { id: IntegrationId; title: string; description: string }[] = [
  {
    id: "anthropic",
    title: "IA — títulos e hashtags (Anthropic)",
    description:
      "Gera títulos e hashtags com IA a partir da transcrição do corte e planeja/escreve as Séries IA. Sem chave configurada, o sistema usa títulos simples automáticos.",
  },
  {
    id: "elevenlabs",
    title: "Narração (ElevenLabs)",
    description:
      "Voz sintética das Séries IA. Uso comercial exige plano pago na ElevenLabs.",
  },
  {
    id: "openai",
    title: "OpenAI",
    description: "Reservada para provedores de imagem e vídeo das Séries IA que usem a OpenAI.",
  },
];

export function AccountsManager() {
  const { channels } = useChannelContext();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);
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

  // Admin-only: integration keys (YouTube/TikTok/.../Anthropic credentials).
  // Non-admins get 403 from this endpoint, so it's never fetched for them.
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({});
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [configureTarget, setConfigureTarget] = useState<IntegrationId | null>(null);

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

  const loadIntegrations = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAdmin) {
        setIntegrations({});
        return;
      }
      setLoadingIntegrations(true);
      try {
        const data = await listIntegrations(signal);
        setIntegrations(Object.fromEntries(data.map((item) => [item.id, item])));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Best-effort: the "Configurar chaves" buttons just stay disabled.
      } finally {
        setLoadingIntegrations(false);
      }
    },
    [isAdmin],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadIntegrations(controller.signal);
    return () => controller.abort();
  }, [loadIntegrations]);

  function handleIntegrationSaved() {
    loadIntegrations();
    load();
  }

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
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fg">Plataformas</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <li
              key={platform.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  {platform.name}
                  <PlatformHelpPopover
                    help={INTEGRATION_HELP[platform.id]}
                    redirectUri={integrations[platform.id]?.redirect_uri ?? null}
                  />
                </span>
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
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                    Somente manual
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-subtle">{platform.notes}</p>
              {platform.supports_oauth && !platform.configured && !isAdmin ? (
                <p className="text-xs text-fg-subtle">
                  Peça ao administrador para configurar.
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-3 pt-2 text-sm font-medium">
                {platform.supports_oauth ? (
                  <button
                    type="button"
                    onClick={() => handleConnect(platform)}
                    className="text-primary-text hover:underline"
                  >
                    Conectar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAddManualPlatform(platform.id)}
                  className="text-primary-text hover:underline"
                >
                  Adicionar conta manual
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setConfigureTarget(platform.id)}
                    disabled={loadingIntegrations || !integrations[platform.id]}
                    className="text-primary-text hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Configurar chaves
                  </button>
                ) : null}
              </div>
            </li>
          ))}

          {AI_INTEGRATION_CARDS.map((card) => (
            <li
              key={card.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  {card.title}
                  <PlatformHelpPopover help={INTEGRATION_HELP[card.id]} redirectUri={null} />
                </span>
                {isAdmin ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      integrations[card.id]?.configured
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    }`}
                  >
                    {integrations[card.id]?.configured ? "Configurado" : "Não configurado"}
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                    Gerenciado pelo administrador
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-subtle">{card.description}</p>
              {isAdmin ? (
                <div className="mt-auto flex gap-3 pt-2 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setConfigureTarget(card.id)}
                    disabled={loadingIntegrations || !integrations[card.id]}
                    className="text-primary-text hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Configurar chaves
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-fg">Contas cadastradas</h2>
          {channelFilter ? (
            <span className="border-info/40 bg-info-soft text-fg flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
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
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none">
            <table className="min-w-full divide-y divide-border text-sm">
              <caption className="sr-only">Contas de plataformas cadastradas</caption>
              <thead className="bg-surface-2">
                <tr>
                  <th scope="col" className={thClass}>Conta</th>
                  <th scope="col" className={thClass}>Plataforma</th>
                  <th scope="col" className={thClass}>Canal</th>
                  {showOwner ? <th scope="col" className={thClass}>Dono</th> : null}
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={thClass}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-surface divide-border">
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
                        className="font-medium text-primary-text hover:underline"
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
                        className="font-medium text-danger hover:underline"
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
            <p role="alert" className="text-sm text-danger">
              {manualError}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="manual-display-name" className="text-sm font-medium text-fg-muted">
              Nome de exibição
            </label>
            <input
              id="manual-display-name"
              required
              value={manualDisplayName}
              onChange={(e) => setManualDisplayName(e.target.value)}
              className="field-control w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="manual-channel" className="text-sm font-medium text-fg-muted">
              Canal (opcional)
            </label>
            <select
              id="manual-channel"
              value={manualChannelId}
              onChange={(e) => setManualChannelId(e.target.value)}
              className="field-control w-full"
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
              className="btn btn-primary"
            >
              {creatingManual ? "Criando…" : "Criar conta"}
            </button>
            <button
              type="button"
              onClick={() => setAddManualPlatform(null)}
              className="btn btn-secondary"
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
            <p className="text-sm text-fg-muted">
              Excluir a conta <span className="font-semibold">{deleteTarget.display_name}</span>? Esta
              ação não pode ser desfeita.
            </p>
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

      {configureTarget && integrations[configureTarget] ? (
        <IntegrationKeysDialog
          integration={integrations[configureTarget]}
          open={configureTarget !== null}
          onClose={() => setConfigureTarget(null)}
          onSaved={handleIntegrationSaved}
        />
      ) : null}
    </div>
  );
}

const thClass =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted";
const tdClass = "px-4 py-3 text-fg";
