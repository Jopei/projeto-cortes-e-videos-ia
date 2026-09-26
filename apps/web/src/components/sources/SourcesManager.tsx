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
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
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
        <div className="rounded-md border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando fontes…</p>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
        >
          {loadError}
        </div>
      ) : sources.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhuma fonte cadastrada ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <caption className="sr-only">Lista de fontes e licenças cadastradas</caption>
            <thead className="bg-slate-50 dark:bg-slate-900">
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
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
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
                  <td className={`${tdClass} space-x-3 whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => setFormMode(source)}
                      className="font-medium text-indigo-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
                    >
                      Editar
                      <span className="sr-only"> {source.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(source)}
                      disabled={deletingId === source.id}
                      className="font-medium text-red-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
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
      )}
    </div>
  );
}

const thClass =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const tdClass = "px-4 py-3 text-slate-800 dark:text-slate-100";
