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
  "field-control w-full";
const labelClass = "text-sm font-medium text-fg-muted";

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
            <p role="alert" className="border-danger/40 bg-danger-soft text-fg rounded-lg border p-2 text-sm">
              {error}
            </p>
          ) : null}

          {integration.redirect_uri ? (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-3">
              <span className="text-xs font-medium text-fg-muted">
                Cadastre exatamente esta URL como redirect URI no painel da plataforma:
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-fg">
                  {integration.redirect_uri}
                </code>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="btn btn-secondary btn-sm shrink-0"
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
                        className="btn btn-secondary btn-sm shrink-0"
                      >
                        {isVisible ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    {maskedValue ? (
                      <button
                        type="button"
                        onClick={() => updateField(field.key, { value: "", removed: true })}
                        className="self-start text-xs font-medium text-danger hover:underline"
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
              className={`rounded-lg border p-2 text-sm ${
                testResult.ok
                  ? "border-success/40 bg-success-soft text-fg"
                  : "border-danger/40 bg-danger-soft text-fg"
              }`}
            >
              {testResult.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="btn btn-secondary"
            >
              {testing ? "Testando…" : "Testar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              disabled={!integration.configured}
              className="btn btn-danger-outline"
            >
              Limpar tudo
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary ml-auto"
            >
              Fechar
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)} title="Limpar chaves">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            Remover todas as chaves salvas de <span className="font-semibold">{integration.name}</span>?
            A integração volta a usar as variáveis do <code>.env</code> (se houver).
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="btn btn-danger"
            >
              {clearing ? "Limpando…" : "Limpar tudo"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(false)}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
