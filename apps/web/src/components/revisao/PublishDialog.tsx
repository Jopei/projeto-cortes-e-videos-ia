"use client";

import { useEffect, useState } from "react";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import { PLATFORM_LABELS } from "@/lib/channels";
import { listAccounts, type PlatformAccount } from "@/lib/accounts";
import {
  PRIVACY_LABELS,
  blockReasonLabel,
  createPublicationsBatch,
  type Privacy,
  type PublicationBatchResult,
} from "@/lib/publications";
import { Dialog } from "@/components/ui/Dialog";
import { PublicationStatusBadge } from "@/components/ui/StatusBadges";

const inputClass =
  "field-control w-full";

export function PublishDialog({
  clipIds,
  onClose,
  onPublished,
}: {
  clipIds: string[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const open = clipIds.length > 0;
  const [target, setTarget] = useState<"channel" | "accounts">("channel");
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<"auto" | "now" | "custom">("auto");
  const [customDateTime, setCustomDateTime] = useState("");
  const [privacy, setPrivacy] = useState<Privacy | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicationBatchResult | null>(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      return;
    }
    listAccounts()
      .then(setAccounts)
      .catch(() => undefined);
  }, [open]);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (target === "accounts" && selectedAccountIds.length === 0) {
      setError("Selecione ao menos uma conta.");
      return;
    }

    const scheduleValue =
      schedule === "custom"
        ? customDateTime
          ? new Date(customDateTime).toISOString()
          : "auto"
        : schedule;

    setSubmitting(true);
    try {
      const data = await createPublicationsBatch({
        clip_ids: clipIds,
        target,
        account_ids: target === "accounts" ? selectedAccountIds : undefined,
        schedule: scheduleValue,
        privacy: privacy || undefined,
      });
      setResult(data);
      onPublished();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
            ? formatApiErrorDetail(err.detail)
            : err.message
          : "Erro inesperado ao publicar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Publicar selecionados" widthClassName="max-w-2xl">
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            {result.created.length} publicação(ões) processada(s).
          </p>
          <ul className="flex flex-col gap-2">
            {result.created.map((pub) => (
              <li
                key={pub.id}
                className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{PLATFORM_LABELS[pub.platform]}</span>
                  <PublicationStatusBadge status={pub.status} />
                </div>
                {pub.block_reasons && pub.block_reasons.length > 0 ? (
                  <ul className="list-disc pl-5 text-xs text-danger">
                    {pub.block_reasons.map((reason) => (
                      <li key={reason}>{blockReasonLabel(reason)}</li>
                    ))}
                  </ul>
                ) : null}
                {pub.error ? (
                  <p className="text-xs text-danger">{pub.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-subtle">
            Publicações &quot;bloqueadas&quot; foram barradas pela trava de direitos autorais (licença da
            fonte não permite esse uso) — ajuste a licença ou a plataforma de destino antes de tentar de
            novo.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary self-start"
          >
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            {clipIds.length} corte(s) selecionado(s).
          </p>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-fg-muted">Destino</legend>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="radio"
                name="target"
                checked={target === "channel"}
                onChange={() => setTarget("channel")}
              />
              Todas as contas do canal de cada corte
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="radio"
                name="target"
                checked={target === "accounts"}
                onChange={() => setTarget("accounts")}
              />
              Contas específicas
            </label>
            {target === "accounts" ? (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
                {accounts.length === 0 ? (
                  <p className="text-xs text-fg-subtle">Nenhuma conta cadastrada.</p>
                ) : (
                  accounts.map((account) => (
                    <label key={account.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedAccountIds.includes(account.id)}
                        onChange={() => toggleAccount(account.id)}
                      />
                      {account.display_name} ({PLATFORM_LABELS[account.platform]})
                    </label>
                  ))
                )}
              </div>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor="publish-schedule" className="text-sm font-medium text-fg-muted">
              Agendamento
            </label>
            <select
              id="publish-schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as "auto" | "now" | "custom")}
              className={inputClass}
            >
              <option value="auto">Automático (próximo horário livre)</option>
              <option value="now">Agora</option>
              <option value="custom">Data e hora específica</option>
            </select>
            {schedule === "custom" ? (
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className={inputClass}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="publish-privacy" className="text-sm font-medium text-fg-muted">
              Privacidade
            </label>
            <select
              id="publish-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as Privacy | "")}
              className={inputClass}
            >
              <option value="">Padrão da conta/plataforma</option>
              {(Object.keys(PRIVACY_LABELS) as Privacy[]).map((p) => (
                <option key={p} value={p}>
                  {PRIVACY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Publicando…" : "Publicar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
