"use client";

import { useState } from "react";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import type { AdminUserCreateInput, AdminUserRead, AdminUserUpdateInput } from "@/lib/admin-users";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { generateStrongPassword } from "@/lib/password";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

const inputClass =
  "field-control w-full";
const labelClass = "text-sm font-medium text-fg-muted";

type CreateProps = {
  mode: "create";
  onSubmit: (payload: AdminUserCreateInput) => Promise<void>;
  onClose: () => void;
};

type EditProps = {
  mode: "edit";
  user: AdminUserRead;
  onSubmit: (payload: AdminUserUpdateInput) => Promise<void>;
  onClose: () => void;
};

export function UserFormDialog(props: CreateProps | EditProps) {
  const { showToast } = useToast();
  const existing = props.mode === "edit" ? props.user : null;

  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState(existing?.display_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [isAdmin, setIsAdmin] = useState(existing?.is_admin ?? false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [storageQuotaGb, setStorageQuotaGb] = useState<string>(
    existing?.storage_quota_bytes != null ? String(existing.storage_quota_bytes / 1024 ** 3) : "",
  );
  const [unlimitedStorage, setUnlimitedStorage] = useState(existing ? existing.storage_quota_bytes === null : false);
  const [dailyAnalysisQuota, setDailyAnalysisQuota] = useState<string>(
    existing?.daily_analysis_quota != null ? String(existing.daily_analysis_quota) : "",
  );
  const [unlimitedAnalysis, setUnlimitedAnalysis] = useState(existing ? existing.daily_analysis_quota === null : false);
  const [maxChannels, setMaxChannels] = useState<string>(
    existing?.max_channels != null ? String(existing.max_channels) : "",
  );
  const [unlimitedChannels, setUnlimitedChannels] = useState(existing ? existing.max_channels === null : false);
  const [maxActiveSeries, setMaxActiveSeries] = useState<string>(
    existing?.max_active_series != null ? String(existing.max_active_series) : "",
  );
  const [unlimitedSeries, setUnlimitedSeries] = useState(existing ? existing.max_active_series == null : false);
  const [aiBudget, setAiBudget] = useState<string>(
    existing?.monthly_ai_budget_usd != null ? String(existing.monthly_ai_budget_usd) : "",
  );
  const [unlimitedAiBudget, setUnlimitedAiBudget] = useState(existing ? existing.monthly_ai_budget_usd == null : false);
  const [mustChangePassword, setMustChangePassword] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleGeneratePassword() {
    const generated = generateStrongPassword();
    setPassword(generated);
    setShowPassword(true);
  }

  async function handleCopyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      showToast("Senha copiada para a área de transferência.", "success");
    } catch {
      showToast("Não foi possível copiar automaticamente — selecione e copie manualmente.", "error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (props.mode === "create" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      if (props.mode === "create") {
        const payload: AdminUserCreateInput = {
          username: username.trim(),
          password,
          display_name: displayName || null,
          email: email || null,
          is_admin: isAdmin,
          storage_quota_gb: unlimitedStorage ? null : storageQuotaGb ? Number(storageQuotaGb) : undefined,
          daily_analysis_quota: unlimitedAnalysis ? null : dailyAnalysisQuota ? Number(dailyAnalysisQuota) : undefined,
          max_channels: unlimitedChannels ? null : maxChannels ? Number(maxChannels) : undefined,
          max_active_series: unlimitedSeries ? null : maxActiveSeries ? Number(maxActiveSeries) : undefined,
          monthly_ai_budget_usd: unlimitedAiBudget ? null : aiBudget ? Number(aiBudget) : undefined,
          must_change_password: mustChangePassword,
        };
        await props.onSubmit(payload);
      } else {
        const payload: AdminUserUpdateInput = {
          display_name: displayName || null,
          email: email || null,
          is_admin: isAdmin,
          is_active: isActive,
          storage_quota_gb: unlimitedStorage ? null : storageQuotaGb ? Number(storageQuotaGb) : null,
          daily_analysis_quota: unlimitedAnalysis ? null : dailyAnalysisQuota ? Number(dailyAnalysisQuota) : null,
          max_channels: unlimitedChannels ? null : maxChannels ? Number(maxChannels) : null,
          max_active_series: unlimitedSeries ? null : maxActiveSeries ? Number(maxActiveSeries) : null,
          monthly_ai_budget_usd: unlimitedAiBudget ? null : aiBudget ? Number(aiBudget) : null,
        };
        await props.onSubmit(payload);
      }
    } catch (err) {
      setError(errorMessageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={props.mode === "create" ? "Criar usuário" : `Editar usuário — ${existing?.username}`}
      widthClassName="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="border-danger/40 bg-danger-soft text-fg rounded-lg border p-2 text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-1">
          <label htmlFor="user-username" className={labelClass}>
            Usuário *
          </label>
          <input
            id="user-username"
            name="new-user-username"
            autoComplete="off"
            required
            disabled={props.mode === "edit"}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
        </div>

        {props.mode === "create" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="user-password" className={labelClass}>
              Senha *
            </label>
            <div className="flex items-center gap-2">
              <input
                id="user-password"
                name="new-user-password"
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="btn btn-secondary btn-sm shrink-0"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <div className="flex gap-3 pt-1 text-xs font-medium">
              <button type="button" onClick={handleGeneratePassword} className="text-primary-text hover:underline">
                Gerar senha forte
              </button>
              <button
                type="button"
                onClick={handleCopyPassword}
                disabled={!password}
                className="text-primary-text hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-fg-subtle">
              Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="user-display-name" className={labelClass}>
              Nome
            </label>
            <input id="user-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="user-email" className={labelClass}>
              E-mail
            </label>
            <input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="user-is-admin"
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor="user-is-admin" className={labelClass}>
            Administrador (sem cotas, vê todos os dados)
          </label>
        </div>

        {props.mode === "edit" ? (
          <div className="flex items-center gap-2">
            <input
              id="user-is-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="user-is-active" className={labelClass}>
              Usuário ativo
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id="user-must-change-password"
              type="checkbox"
              checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="user-must-change-password" className={labelClass}>
              Exigir troca de senha no 1º login
            </label>
          </div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold text-fg">Cotas</legend>

          <QuotaField
            label="Armazenamento (GB)"
            value={storageQuotaGb}
            onValueChange={setStorageQuotaGb}
            unlimited={unlimitedStorage}
            onUnlimitedChange={setUnlimitedStorage}
            step="0.5"
          />
          <QuotaField
            label="Análises por dia"
            value={dailyAnalysisQuota}
            onValueChange={setDailyAnalysisQuota}
            unlimited={unlimitedAnalysis}
            onUnlimitedChange={setUnlimitedAnalysis}
          />
          <QuotaField
            label="Máximo de canais"
            value={maxChannels}
            onValueChange={setMaxChannels}
            unlimited={unlimitedChannels}
            onUnlimitedChange={setUnlimitedChannels}
          />
          <QuotaField
            label="Séries IA ativas (máx.)"
            value={maxActiveSeries}
            onValueChange={setMaxActiveSeries}
            unlimited={unlimitedSeries}
            onUnlimitedChange={setUnlimitedSeries}
          />
          <QuotaField
            label="Orçamento mensal de IA (US$)"
            value={aiBudget}
            onValueChange={setAiBudget}
            unlimited={unlimitedAiBudget}
            onUnlimitedChange={setUnlimitedAiBudget}
            step="0.5"
          />
        </fieldset>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
          >
            {submitting ? "Salvando…" : props.mode === "create" ? "Criar usuário" : "Salvar alterações"}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="btn btn-secondary"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function QuotaField({
  label,
  value,
  onValueChange,
  unlimited,
  onUnlimitedChange,
  step,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  unlimited: boolean;
  onUnlimitedChange: (unlimited: boolean) => void;
  step?: string;
}) {
  const id = `quota-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-48 shrink-0 text-sm text-fg-muted">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={step ?? "1"}
        disabled={unlimited}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={`${inputClass} disabled:opacity-50`}
      />
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => onUnlimitedChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Sem limite
      </label>
    </div>
  );
}

function errorMessageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Erro inesperado ao salvar o usuário.";
  if (err.status === 409) {
    if (err.message.toLowerCase().includes("email")) return "Este e-mail já está em uso por outro usuário.";
    if (err.message.toLowerCase().includes("username")) return "Este nome de usuário já existe.";
    if (err.message.toLowerCase().includes("admin")) {
      return "Não é possível remover os próprios direitos de administrador ou deixar o sistema sem nenhum admin ativo.";
    }
    return err.message;
  }
  return err.detail ? formatApiErrorDetail(err.detail) : err.message;
}
