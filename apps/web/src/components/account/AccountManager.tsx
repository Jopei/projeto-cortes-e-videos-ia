"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getMyUsage, type UsageRead } from "@/lib/me";
import { formatBytes } from "@/lib/tus";
import { formatUsd } from "@/lib/format";
import { useAuth } from "@/lib/user-context";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { UsageBar } from "@/components/ui/UsageBar";
import { SkeletonList } from "@/components/ui/Skeleton";

export function AccountManager() {
  const searchParams = useSearchParams();
  const forcedChange = searchParams.get("forcar-troca") === "1";
  const { user, refresh } = useAuth();
  const [usage, setUsage] = useState<UsageRead | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  const loadUsage = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getMyUsage(signal);
      setUsage(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setUsageError(err instanceof ApiError ? err.message : "Não foi possível carregar o uso da conta.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadUsage(controller.signal);
    return () => controller.abort();
  }, [loadUsage]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {forcedChange ? (
        <div
          role="alert"
          className="border-warning/40 bg-warning-soft text-fg rounded-lg border p-3 text-sm"
        >
          Por segurança, você precisa trocar sua senha antes de continuar usando o painel.
        </div>
      ) : null}

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4">
        <h2 className="text-base font-semibold text-fg">Meus dados</h2>
        {user ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-fg-subtle">Usuário</dt>
              <dd className="text-fg">{user.username}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-fg-subtle">Nome</dt>
              <dd className="text-fg">{user.display_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-fg-subtle">E-mail</dt>
              <dd className="text-fg">{user.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-fg-subtle">Perfil</dt>
              <dd className="text-fg">{user.is_admin ? "Administrador" : "Usuário"}</dd>
            </div>
          </dl>
        ) : (
          <SkeletonList rows={2} />
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4">
        <h2 className="text-base font-semibold text-fg">Uso e cotas</h2>
        {user?.is_admin ? (
          <p className="text-sm text-fg-subtle">
            Administradores não têm cotas — uso ilimitado de armazenamento, análises e canais.
          </p>
        ) : usageError ? (
          <p role="alert" className="text-sm text-danger">
            {usageError}
          </p>
        ) : usage ? (
          <div className="flex flex-col gap-4">
            <UsageBar
              label="Armazenamento"
              used={usage.storage_used_bytes}
              quota={usage.storage_quota_bytes}
              formatValue={(v) => formatBytes(v)}
            />
            <UsageBar
              label="Análises hoje"
              used={usage.analyses_today}
              quota={usage.daily_analysis_quota}
              formatValue={(v) => String(v)}
            />
            <UsageBar
              label="Canais"
              used={usage.channels_count}
              quota={usage.max_channels}
              formatValue={(v) => String(v)}
            />
            <UsageBar
              label="Séries IA ativas"
              used={usage.active_series ?? 0}
              quota={usage.max_active_series ?? null}
              formatValue={(v) => String(v)}
            />
            <UsageBar
              label="Gasto com IA neste mês (US$)"
              used={usage.ai_spend_month_usd ?? 0}
              quota={usage.monthly_ai_budget_usd ?? null}
              formatValue={(v) => formatUsd(v)}
            />
          </div>
        ) : (
          <SkeletonList rows={3} />
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4">
        <h2 className="text-base font-semibold text-fg">Trocar senha</h2>
        <ChangePasswordForm onChanged={refresh} />
      </section>
    </div>
  );
}
