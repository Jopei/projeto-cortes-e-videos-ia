"use client";

import { useEffect, useState } from "react";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import {
  clearIntegration,
  testIntegration,
  updateIntegration,
  type Integration,
  type IntegrationTestResult,
} from "@/lib/integrations";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50";
const labelClass = "text-sm font-medium text-slate-700 dark:text-slate-200";

const SOURCE_LABELS: Record<string, string> = {
  db: "Banco",
  env: ".env",
  mixed: "Banco + .env",
};

type FieldState = { value: string; removed: boolean };

function initFields(integration: Integration): Record<string, FieldState> {
  const next: Record<string, FieldState> = {};
  for (const field of integration.fields) {
    next[field.key] = {
      value: field.secret ? "" : integration.values[field.key] ?? "",
      removed: false,
    };
  }
  return next;
}

export function IntegrationKeysDialog({
  integration,
  open,
  onClose,
  onSaved,
}: {
  integration: Integration;
  open: boolean;
  onClose: () => void;
  /** Called after any change (save/clear) that the parent should re-fetch
   * `/api/admin/integrations` + `/api/platforms` for (badge/status sync). */
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [fields, setFields] = useState<Record<string, FieldState>>(() => initFields(integration));
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields(initFields(integration));
    setVisible({});
    setTestResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, integration.id, integration.updated_at]);

  function updateField(key: string, patch: Partial<FieldState>) {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function handleCopyRedirect() {
    if (!integration.redirect_uri) return;
    try {
      await navigator.clipboard.writeText(integration.redirect_uri);
      showToast("Redirect URI copiada.", "success");
    } catch {
      showToast("Não foi possível copiar automaticamente — selecione e copie manualmente.", "error");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const values: Record<string, string | null> = {};
    for (const field of integration.fields) {
      const state = fields[field.key];
      if (!state) continue;
      if (field.secret) {
        if (state.value !== "") {
          values[field.key] = state.value;
        } else if (state.removed) {
          values[field.key] = null;
        }
        // else: left blank without removing -> leave unchanged (omit)
      } else {
        const initial = integration.values[field.key] ?? "";
        if (state.value !== initial) {
          values[field.key] = state.value === "" ? null : state.value;
        }
      }
    }
    if (Object.keys(values).length === 0) {
      showToast("Nenhuma alteração para salvar.", "info");
      return;
    }
    setSaving(true);
    try {
      await updateIntegration(integration.id, { values });
      showToast("Chaves salvas.", "success");
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
            ? formatApiErrorDetail(err.detail)
            : err.message
          : "Erro inesperado ao salvar as chaves.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const result = await testIntegration(integration.id);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof ApiError ? err.message : "Erro ao testar a integração.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      await clearIntegration(integration.id);
      showToast("Chaves removidas — voltou a usar o .env (se houver).", "success");
      setConfirmClearOpen(false);
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Erro ao limpar as chaves.", "error");
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={() => (confirmClearOpen ? setConfirmClearOpen(false) : onClose())}
        title={`Configurar chaves — ${integration.name}`}
        widthClassName="max-w-xl"
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant={integration.configured ? "success" : "neutral"}>
              {integration.configured ? "Configurado" : "Não configurado"}
            </Badge>
            {integration.source ? <Badge variant="info">Origem: {SOURCE_LABELS[integration.source] ?? integration.source}</Badge> : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-md border border-red-400 bg-red-50 p-2 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          {integration.redirect_uri ? (
            <div className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Cadastre exatamente esta URL como redirect URI no painel da plataforma:
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-slate-800 dark:text-slate-100">
                  {integration.redirect_uri}
                </code>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Copiar
                </button>
              </div>
            </div>
          ) : null}

          {integration.fields.map((field) => {
            const state = fields[field.key] ?? { value: "", removed: false };
            const maskedValue = field.secret ? integration.values[field.key] : null;
            const isVisible = visible[field.key] ?? false;
            const fieldId = `integration-${integration.id}-${field.key}`;
            return (
              <div key={field.key} className="flex flex-col gap-1">
                <label htmlFor={fieldId} className={labelClass}>
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                {field.secret ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        id={fieldId}
                        name={`new-${fieldId}`}
                        autoComplete="off"
                        type={isVisible ? "text" : "password"}
                        value={state.value}
                        placeholder={maskedValue ? `${maskedValue} — deixe em branco para manter` : ""}
                        onChange={(e) => updateField(field.key, { value: e.target.value, removed: false })}
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setVisible((v) => ({ ...v, [field.key]: !v[field.key] }))}
                        className="shrink-0 rounded-md border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {isVisible ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    {maskedValue ? (
                      <button
                        type="button"
                        onClick={() => updateField(field.key, { value: "", removed: true })}
                        className="self-start text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        {state.removed ? "Valor será removido ao salvar" : "Remover valor"}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <input
                    id={fieldId}
                    name={`new-${fieldId}`}
                    autoComplete="off"
                    value={state.value}
                    onChange={(e) => updateField(field.key, { value: e.target.value })}
                    className={inputClass}
                  />
                )}
              </div>
            );
          })}

          {testResult ? (
            <p
              role="status"
              className={`rounded-md border p-2 text-sm ${
                testResult.ok
                  ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-red-400 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
              }`}
            >
              {testResult.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {testing ? "Testando…" : "Testar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              disabled={!integration.configured}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Limpar tudo
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)} title="Limpar chaves">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Remover todas as chaves salvas de <span className="font-semibold">{integration.name}</span>?
            A integração volta a usar as variáveis do <code>.env</code> (se houver).
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {clearing ? "Limpando…" : "Limpar tudo"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
