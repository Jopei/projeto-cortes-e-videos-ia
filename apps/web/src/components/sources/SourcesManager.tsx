"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Source,
  type SourceInput,
  createSource,
  deleteSource,
  listSources,
  updateSource,
} from "@/lib/sources";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { LicenseTypeBadge, SourceWarningBadges } from "@/components/sources/LicenseBadge";
import { SourceForm } from "@/components/sources/SourceForm";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

export function SourcesManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"closed" | "create" | Source>("closed");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listSources(signal);
      setSources(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoadError(
        err instanceof ApiError ? err.message : "Não foi possível carregar as fontes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleCreate(payload: SourceInput) {
    await createSource(payload);
    setFormMode("closed");
    setNotice("Fonte criada com sucesso.");
    await load();
  }

  async function handleUpdate(id: string, payload: SourceInput) {
    await updateSource(id, payload);
    setFormMode("closed");
    setNotice("Fonte atualizada com sucesso.");
    await load();
  }

  async function handleDelete(source: Source) {
    if (!window.confirm(`Excluir a fonte "${source.title}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setDeletingId(source.id);
    try {
      await deleteSource(source.id);
      setNotice("Fonte excluída.");
      await load();
    } catch (err) {
      setNotice(
        err instanceof ApiError
          ? `Erro ao excluir: ${err.detail ? formatApiErrorDetail(err.detail) : err.message}`
          : "Erro inesperado ao excluir a fonte.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        {notice}
      </div>

      {formMode === "closed" ? (
        <div>
          <button
            type="button"
            onClick={() => setFormMode("create")}
            className="btn btn-primary"
          >
            + Nova fonte
          </button>
        </div>
      ) : (
        <SourceForm
          source={formMode === "create" ? undefined : formMode}
          onSubmit={(payload) =>
            formMode === "create" ? handleCreate(payload) : handleUpdate(formMode.id, payload)
          }
          onCancel={() => setFormMode("closed")}
        />
      )}

      {notice ? (
        <div className="border-success/40 bg-success-soft text-fg rounded-lg border p-3 text-sm">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-fg-subtle">Carregando fontes…</p>
      ) : loadError ? (
        <div
          role="alert"
          className="border-danger/40 bg-danger-soft text-fg rounded-lg border p-3 text-sm"
        >
          {loadError}
        </div>
      ) : sources.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          Nenhuma fonte cadastrada ainda.
        </p>
      ) : (
        <>
        <ul className="flex flex-col gap-3 md:hidden" aria-label="Fontes e licenças">
          {sources.map((source) => (
            <li key={source.id} className="rounded-xl border border-border bg-surface p-4 shadow-card dark:shadow-none">
              <p className="font-medium text-fg">{source.title}</p>
              <p className="text-sm text-fg-muted">{source.work_name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <LicenseTypeBadge licenseType={source.license_type} />
                <SourceWarningBadges source={source} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 text-sm">
                <dt className="text-fg-subtle">Validade</dt>
                <dd className="text-fg-muted tabular-nums">
                  {formatDate(source.valid_from)} – {formatDate(source.valid_until)}
                </dd>
                {showOwner ? (
                  <>
                    <dt className="text-fg-subtle">Dono</dt>
                    <dd className="text-fg-muted">{ownerLabel(source.owner_id)}</dd>
                  </>
                ) : null}
              </dl>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setFormMode(source)} className="btn btn-secondary btn-sm flex-1">
                  Editar<span className="sr-only"> {source.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(source)}
                  disabled={deletingId === source.id}
                  className="btn btn-danger-outline btn-sm flex-1"
                >
                  {deletingId === source.id ? "Excluindo…" : "Excluir"}
                  <span className="sr-only"> {source.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none md:block">
          <table className="min-w-full divide-y divide-border text-sm">
            <caption className="sr-only">Lista de fontes e licenças cadastradas</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={thClass}>
                  Título
                </th>
                <th scope="col" className={thClass}>
                  Obra
                </th>
                <th scope="col" className={thClass}>
                  Licença
                </th>
                <th scope="col" className={thClass}>
                  Validade
                </th>
                {showOwner ? (
                  <th scope="col" className={thClass}>
                    Dono
                  </th>
                ) : null}
                <th scope="col" className={thClass}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y bg-surface divide-border">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td className={tdClass}>{source.title}</td>
                  <td className={tdClass}>{source.work_name}</td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <LicenseTypeBadge licenseType={source.license_type} />
                      <SourceWarningBadges source={source} />
                    </div>
                  </td>
                  <td className={tdClass}>
                    {formatDate(source.valid_from)} – {formatDate(source.valid_until)}
                  </td>
                  {showOwner ? <td className={tdClass}>{ownerLabel(source.owner_id)}</td> : null}
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => setFormMode(source)}
                      className="btn btn-ghost btn-sm"
                    >
                      Editar
                      <span className="sr-only"> {source.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(source)}
                      disabled={deletingId === source.id}
                      className="btn btn-danger-outline btn-sm"
                    >
                      {deletingId === source.id ? "Excluindo…" : "Excluir"}
                      <span className="sr-only"> {source.title}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

const thClass =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-subtle";
const tdClass = "px-4 py-3 text-fg";
