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
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { MoreMenu } from "@/components/ui/MoreMenu";
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
      <Callout variant="danger" role="alert" title="Não foi possível carregar as contas" action={<Button variant="secondary" size="sm" onClick={() => void load()}>Tentar de novo</Button>}>
        {error}
      </Callout>
    );
  }

  const accountColumns: Column<PlatformAccount>[] = [
    { id: "name", header: "Conta", primary: true, cell: (a) => a.display_name },
    { id: "platform", header: "Plataforma", cell: (a) => PLATFORM_LABELS[a.platform] },
    {
      id: "channel",
      header: "Canal",
      cell: (a) => (
        <span className="flex items-center gap-1.5">
          {a.channel_id ? <ChannelColorDot color={channels.find((c) => c.id === a.channel_id)?.color ?? null} /> : null}
          {channelName(channels, a.channel_id)}
        </span>
      ),
    },
    ...(showOwner ? [{ id: "owner", header: "Dono", cell: (a: PlatformAccount) => ownerLabel(a.owner_id) }] : []),
    { id: "status", header: "Status", cell: (a) => <AccountStatusBadge status={a.status} /> },
  ];

  function platformState(platform: PlatformInfo): { label: string; variant: BadgeVariant } {
    if (accounts.some((a) => a.platform === platform.id && a.status === "connected")) return { label: "Conectada", variant: "success" };
    if (!platform.supports_oauth) return { label: "Manual", variant: "neutral" };
    return platform.configured ? { label: "Pronta para conectar", variant: "info" } : { label: "Sem chaves", variant: "warning" };
  }

  const configureButton = (id: IntegrationId, primary: boolean) => (
    <Button
      variant={primary ? "primary" : "ghost"}
      size={primary ? "md" : "sm"}
      onClick={() => setConfigureTarget(id)}
      disabled={loadingIntegrations || !integrations[id]}
      aria-label={primary ? undefined : "Configurar chaves"}
      title={primary ? undefined : "Configurar chaves"}
    >
      <Icon name="settings" size={16} />
      {primary ? "Configurar chaves" : null}
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="platforms-heading" className="flex flex-col gap-3">
        <h2 id="platforms-heading" className="text-base font-semibold text-fg">
          Plataformas
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => {
            const state = platformState(platform);
            const needsKeys = platform.supports_oauth && !platform.configured;
            return (
              <li
                key={platform.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-shadow hover:border-border-strong hover:shadow-card-hover dark:shadow-none dark:ring-1 dark:ring-white/5 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-fg-muted"
                  >
                    {platform.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 font-semibold text-fg">
                      <span className="truncate">{platform.name}</span>
                      <PlatformHelpPopover
                        help={INTEGRATION_HELP[platform.id]}
                        redirectUri={integrations[platform.id]?.redirect_uri ?? null}
                      />
                    </p>
                    <Badge variant={state.variant} dot>
                      {state.label}
                    </Badge>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm text-fg-muted">{platform.notes}</p>
                {needsKeys && !isAdmin ? (
                  <p className="text-sm text-fg-subtle">Peça ao administrador para configurar as chaves.</p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {platform.supports_oauth && !needsKeys ? (
                    <Button onClick={() => void handleConnect(platform)}>Conectar</Button>
                  ) : null}
                  {needsKeys && isAdmin ? configureButton(platform.id, true) : null}
                  <Button
                    variant={platform.supports_oauth ? "ghost" : "primary"}
                    size={platform.supports_oauth ? "sm" : "md"}
                    onClick={() => setAddManualPlatform(platform.id)}
                  >
                    Adicionar conta manual
                  </Button>
                  {isAdmin && !needsKeys && platform.supports_oauth ? <span className="ml-auto">{configureButton(platform.id, false)}</span> : null}
                </div>
              </li>
            );
          })}

          {AI_INTEGRATION_CARDS.map((card) => (
            <li
              key={card.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-shadow hover:border-border-strong hover:shadow-card-hover dark:shadow-none dark:ring-1 dark:ring-white/5 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
                  <Icon name="sparkles" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-semibold text-fg">
                    <span className="truncate">{card.title}</span>
                    <PlatformHelpPopover help={INTEGRATION_HELP[card.id]} redirectUri={null} />
                  </p>
                  {isAdmin ? (
                    <Badge variant={integrations[card.id]?.configured ? "success" : "warning"} dot>
                      {integrations[card.id]?.configured ? "Configurado" : "Sem chaves"}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Gerenciado pelo administrador</Badge>
                  )}
                </div>
              </div>
              <p className="line-clamp-4 text-sm text-fg-muted">{card.description}</p>
              {isAdmin ? <div className="mt-auto pt-1">{configureButton(card.id, !integrations[card.id]?.configured)}</div> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="accounts-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="accounts-heading" className="text-base font-semibold text-fg">
            Contas cadastradas
          </h2>
          {channelFilter ? (
            <span className="flex items-center gap-1 rounded-full border border-info/40 bg-info-soft py-0.5 pl-3 pr-1 text-xs text-fg">
              Canal: {channelName(channels, channelFilter)}
              <button
                type="button"
                onClick={() => router.replace(pathname)}
                aria-label="Remover filtro de canal"
                className="focus-ring flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2"
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ) : null}
        </div>
        {accounts.length === 0 ? (
          <EmptyState
            icon="plug"
            title="Nenhuma conta cadastrada"
            description="Conecte uma conta OAuth ou adicione uma conta manual (ex.: Bilibili) para publicar cortes."
          />
        ) : (
          <DataTable
            caption="Contas de plataformas cadastradas"
            columns={accountColumns}
            rows={accounts}
            rowKey={(a) => a.id}
            actions={(a) => (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditTarget(a)}>
                  Editar<span className="sr-only"> {a.display_name}</span>
                </Button>
                {a.status === "expired" || a.status === "error" ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const info = platforms.find((p) => p.id === a.platform);
                      if (info) void handleConnect(info);
                    }}
                  >
                    Reconectar
                  </Button>
                ) : null}
                <MoreMenu label={a.display_name} items={[{ label: "Excluir conta", danger: true, onSelect: () => setDeleteTarget(a) }]} />
              </>
            )}
          />
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir conta"
        confirmLabel="Excluir"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        Excluir a conta <span className="font-semibold text-fg">{deleteTarget?.display_name}</span>? Esta ação não pode ser desfeita.
      </ConfirmDialog>

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

