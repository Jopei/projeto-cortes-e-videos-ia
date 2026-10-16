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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

const NOTICE_KEY = "cortes.fontes.aviso-recolhido";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

function Validity({ source }: { source: Source }) {
  const left = daysUntil(source.valid_until);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="tabular-nums">
        {source.valid_from || source.valid_until ? `${formatDate(source.valid_from)} – ${formatDate(source.valid_until)}` : "Sem prazo"}
      </span>
      {left !== null && left >= 0 && left <= 30 ? <Badge variant="warning">vence em {left} d</Badge> : null}
    </span>
  );
}

function LicenseRules({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Callout
      variant="warning"
      role="alert"
      title="Aviso de licenciamento"
      className="mb-6"
      action={
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={!collapsed}>
          {collapsed ? "Ver regras" : "Ocultar"}
        </Button>
      }
    >
      {collapsed ? (
        <span>Nenhum corte é publicado sem licença válida verificada.</span>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          <li>Nenhum corte é publicado sem licença válida verificada.</li>
          <li>
            Dublagens e trilhas sonoras podem ter direitos próprios, distintos dos direitos do vídeo original —
            precisam de licença separada.
          </li>
          <li>
            Conteúdo sob licenças CC-NC (não comercial) e CC-ND (sem derivações) é bloqueado para monetização.
          </li>
        </ul>
      )}
    </Callout>
  );
}

export function SourcesManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"closed" | "create" | Source>("closed");
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [rulesCollapsed, setRulesCollapsed] = useState(false);
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  useEffect(() => {
    setRulesCollapsed(window.localStorage.getItem(NOTICE_KEY) === "1");
  }, []);

  function toggleRules() {
    setRulesCollapsed((c) => {
      window.localStorage.setItem(NOTICE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      setSources(await listSources(signal));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar as fontes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleCreate(payload: SourceInput) {
    await createSource(payload);
    setFormMode("closed");
    showToast("Fonte criada com sucesso.", "success");
    await load();
  }

  async function handleUpdate(id: string, payload: SourceInput) {
    await updateSource(id, payload);
    setFormMode("closed");
    showToast("Fonte atualizada com sucesso.", "success");
    await load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSource(deleteTarget.id);
      showToast("Fonte excluída.", "success");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? `Erro ao excluir: ${err.detail ? formatApiErrorDetail(err.detail) : err.message}`
          : "Erro inesperado ao excluir a fonte.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Source>[] = [
    { id: "title", header: "Título", primary: true, cell: (s) => s.title },
    { id: "work", header: "Obra", cell: (s) => s.work_name },
    {
      id: "license",
      header: "Licença",
      cell: (s) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <LicenseTypeBadge licenseType={s.license_type} />
          <SourceWarningBadges source={s} />
        </div>
      ),
    },
    { id: "validity", header: "Validade", cell: (s) => <Validity source={s} /> },
    ...(showOwner ? [{ id: "owner", header: "Dono", cell: (s: Source) => ownerLabel(s.owner_id) }] : []),
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Fontes & Licenças"
        description="Cadastro das fontes de vídeo (licenciadas ou de domínio público) e do tipo de licença associada a cada uma, incluindo trilhas e dublagens usadas nos cortes."
        actions={
          formMode === "closed" ? (
            <Button onClick={() => setFormMode("create")}>
              <Icon name="plus" size={16} /> Nova fonte
            </Button>
          ) : null
        }
      />

      <LicenseRules collapsed={rulesCollapsed} onToggle={toggleRules} />

      {formMode !== "closed" ? (
        <div className="mb-6">
          <SourceForm
            source={formMode === "create" ? undefined : formMode}
            onSubmit={(payload) =>
              formMode === "create" ? handleCreate(payload) : handleUpdate(formMode.id, payload)
            }
            onCancel={() => setFormMode("closed")}
          />
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadError ? (
        <Callout variant="danger" role="alert" title="Não foi possível carregar as fontes" action={<Button variant="secondary" size="sm" onClick={() => void load()}>Tentar de novo</Button>}>
          {loadError}
        </Callout>
      ) : sources.length === 0 ? (
        <EmptyState
          icon="shield"
          title="Nenhuma fonte cadastrada ainda"
          description="Cadastre a licença do vídeo antes de enviá-lo. Sem fonte e licença válida, nada é publicado."
          action={<Button onClick={() => setFormMode("create")}>Cadastrar primeira fonte</Button>}
        />
      ) : (
        <DataTable
          caption="Fontes e licenças cadastradas"
          columns={columns}
          rows={sources}
          rowKey={(s) => s.id}
          actions={(s) => (
            <>
              <Button variant="secondary" size="sm" onClick={() => setFormMode(s)}>
                Editar<span className="sr-only"> {s.title}</span>
              </Button>
              <MoreMenu
                label={s.title}
                items={[
                  {
                    label: s.license_type === "ai_generated" ? "Excluir (fonte de Série IA)" : "Excluir",
                    danger: true,
                    disabled: s.license_type === "ai_generated",
                    onSelect: () => {
                      setDeleteError(null);
                      setDeleteTarget(s);
                    },
                  },
                ]}
              />
            </>
          )}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir fonte"
        confirmLabel="Excluir"
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        Excluir a fonte <span className="font-semibold text-fg">{deleteTarget?.title}</span>? Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  );
}
