"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { ApiError, redirectToLogin } from "@/lib/api";
import { useShowOwnerColumn, useOwnerLabel } from "@/lib/admin-view";
import { useChannelContext } from "@/lib/channel-context";
import {
  listMediaAssets,
  mediaAssetVideoUrl,
  updateMediaAsset,
  MEDIA_ASSET_STATUS_LABELS,
  type MediaAsset,
} from "@/lib/media-assets";
import { listSources, type Source } from "@/lib/sources";
import {
  ACCEPTED_EXTENSIONS,
  TUS_URL,
  formatBytes,
  formatDuration,
  hasAcceptedExtension,
} from "@/lib/tus";
import { AnalyzeDialog } from "@/components/upload/AnalyzeDialog";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { useToast } from "@/components/ui/Toast";

const CHUNK_SIZE = 50 * 1024 * 1024; // ~50MB per spec

type UploadStatus = "queued" | "uploading" | "paused" | "success" | "error";

type UploadItem = {
  id: string;
  filename: string;
  totalBytes: number;
  status: UploadStatus;
  bytesUploaded: number;
  speedBps: number;
  error?: string;
};

type UploadRefs = {
  upload: tus.Upload;
  lastProgressAt: number;
  lastProgressBytes: number;
};

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function UploadManager() {
  const { channels, selectedChannelId: globalChannelId } = useChannelContext();
  const { showToast } = useToast();
  const showOwner = useShowOwnerColumn();
  const ownerLabel = useOwnerLabel();

  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [uploadChannelId, setUploadChannelId] = useState<string>(globalChannelId);
  const [uploadChannelTouched, setUploadChannelTouched] = useState(false);

  const [items, setItems] = useState<UploadItem[]>([]);
  const uploadsRef = useRef<Map<string, UploadRefs>>(new Map());

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const [analyzeTarget, setAnalyzeTarget] = useState<MediaAsset | null>(null);
  const [videoTarget, setVideoTarget] = useState<MediaAsset | null>(null);
  const [channelChangeTarget, setChannelChangeTarget] = useState<MediaAsset | null>(null);
  const [pendingChannelId, setPendingChannelId] = useState<string>("");
  const [savingChannel, setSavingChannel] = useState(false);

  // Default the per-upload channel to the source's own default_channel_id
  // once a source is picked (unless the user already touched the field).
  useEffect(() => {
    if (uploadChannelTouched) return;
    const source = sources.find((s) => s.id === selectedSourceId);
    if (source?.default_channel_id) {
      setUploadChannelId(source.default_channel_id);
    } else {
      setUploadChannelId(globalChannelId);
    }
  }, [selectedSourceId, sources, globalChannelId, uploadChannelTouched]);

  const loadSources = useCallback(async (signal?: AbortSignal) => {
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      const data = await listSources(signal);
      setSources(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSourcesError(
        err instanceof ApiError ? err.message : "Não foi possível carregar as fontes.",
      );
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  const loadAssets = useCallback(
    async (signal?: AbortSignal) => {
      setAssetsLoading(true);
      setAssetsError(null);
      try {
        const data = await listMediaAssets(globalChannelId || undefined, signal);
        setAssets(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAssetsError(
          err instanceof ApiError ? err.message : "Não foi possível carregar os uploads recebidos.",
        );
      } finally {
        setAssetsLoading(false);
      }
    },
    [globalChannelId],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSources(controller.signal);
    return () => controller.abort();
  }, [loadSources]);

  useEffect(() => {
    const controller = new AbortController();
    loadAssets(controller.signal);
    return () => controller.abort();
  }, [loadAssets]);

  const sourceById = useMemo(() => {
    const map = new Map<string, Source>();
    for (const source of sources) map.set(source.id, source);
    return map;
  }, [sources]);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function addFiles(fileList: FileList | File[]) {
    if (!selectedSourceId) return;
    const files = Array.from(fileList);

    for (const file of files) {
      if (!hasAcceptedExtension(file.name)) {
        setLiveMessage(`Arquivo "${file.name}" ignorado: extensão não suportada.`);
        continue;
      }

      const id = randomId();
      const item: UploadItem = {
        id,
        filename: file.name,
        totalBytes: file.size,
        status: "queued",
        bytesUploaded: 0,
        speedBps: 0,
      };
      setItems((prev) => [...prev, item]);

      const upload = new tus.Upload(file, {
        endpoint: TUS_URL,
        chunkSize: CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: {
          filename: file.name,
          filetype: file.type || "application/octet-stream",
          source_id: selectedSourceId,
          ...(uploadChannelId ? { channel_id: uploadChannelId } : {}),
        },
        onBeforeRequest: (req) => {
          // tusd validates the same `cortes_session` cookie as the API; the
          // browser only attaches it cross-port if the request is made with
          // credentials.
          const xhr = req.getUnderlyingObject() as XMLHttpRequest;
          xhr.withCredentials = true;
        },
        onError: (error) => {
          const detailed = error as tus.DetailedError;
          const status = detailed.originalResponse?.getStatus?.();
          if (status === 401) {
            updateItem(id, { status: "error", error: "Sessão expirada. Faça login novamente." });
            redirectToLogin();
            return;
          }
          const serverMessage = detailed.originalResponse?.getBody?.();
          const message = serverMessage?.trim() || error.message || "Falha no upload.";
          updateItem(id, { status: "error", error: message });
          setLiveMessage(`Erro ao enviar "${file.name}": ${message}`);
          if (status === 413) {
            showToast(`Cota de armazenamento excedida ao enviar "${file.name}": ${message}`, "error");
          } else {
            showToast(`Erro ao enviar "${file.name}": ${message}`, "error");
          }
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const refs = uploadsRef.current.get(id);
          const now = Date.now();
          let speedBps = 0;
          if (refs) {
            const elapsedSec = (now - refs.lastProgressAt) / 1000;
            const deltaBytes = bytesUploaded - refs.lastProgressBytes;
            if (elapsedSec > 0) speedBps = deltaBytes / elapsedSec;
            refs.lastProgressAt = now;
            refs.lastProgressBytes = bytesUploaded;
          }
          updateItem(id, { bytesUploaded, totalBytes: bytesTotal, speedBps, status: "uploading" });
        },
        onSuccess: () => {
          updateItem(id, { status: "success", bytesUploaded: item.totalBytes });
          setLiveMessage(`Upload de "${file.name}" concluído.`);
          loadAssets();
        },
      });

      uploadsRef.current.set(id, { upload, lastProgressAt: Date.now(), lastProgressBytes: 0 });

      try {
        const previousUploads = await upload.findPreviousUploads();
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
          setLiveMessage(`Retomando upload anterior de "${file.name}".`);
        }
      } catch {
        // ignore: if lookup fails we just start a fresh upload
      }

      updateItem(id, { status: "uploading" });
      upload.start();
    }
  }

  function handlePause(id: string) {
    const refs = uploadsRef.current.get(id);
    if (!refs) return;
    refs.upload.abort(false);
    updateItem(id, { status: "paused" });
  }

  function handleResume(id: string) {
    const refs = uploadsRef.current.get(id);
    if (!refs) return;
    refs.upload.start();
    updateItem(id, { status: "uploading" });
  }

  async function handleCancel(id: string) {
    const refs = uploadsRef.current.get(id);
    if (!refs) return;
    try {
      await refs.upload.abort(true);
    } catch {
      // best-effort: still remove locally even if the terminate call failed
    }
    uploadsRef.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedSourceId) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  const uploadDisabled = !selectedSourceId;

  const assetColumns: Column<MediaAsset>[] = [
    { id: "file", header: "Arquivo", primary: true, cell: (a) => a.filename },
    { id: "source", header: "Fonte", cell: (a) => sourceById.get(a.source_id)?.title ?? a.source_id },
    { id: "channel", header: "Canal", cell: (a) => channels.find((c) => c.id === a.channel_id)?.name ?? "—" },
    ...(showOwner ? [{ id: "owner", header: "Dono", cell: (a: MediaAsset) => ownerLabel(a.owner_id) }] : []),
    { id: "status", header: "Status", cell: (a) => MEDIA_ASSET_STATUS_LABELS[a.status] },
    { id: "created", header: "Recebido em", cell: (a) => new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      <section aria-labelledby="step1-heading" className="flex flex-col gap-2">
        <h2 id="step1-heading" className="text-base font-semibold text-fg">
          1. Selecione a fonte/licença
        </h2>

        {sourcesLoading ? (
          <p className="text-sm text-fg-subtle">Carregando fontes…</p>
        ) : sourcesError ? (
          <p role="alert" className="text-sm text-danger">
            {sourcesError}
          </p>
        ) : sources.length === 0 ? (
          <div className="border-warning/40 bg-warning-soft text-fg rounded-lg border p-3 text-sm">
            Nenhuma fonte cadastrada ainda.{" "}
            <Link href="/cortes/fontes-licencas" className="font-semibold underline">
              Cadastre uma fonte
            </Link>{" "}
            antes de enviar arquivos.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="source-select" className="text-sm font-medium text-fg-muted">
              Fonte
            </label>
            <select
              id="source-select"
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="field-control w-full max-w-md"
            >
              <option value="">Selecione…</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title} ({source.work_name})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="upload-channel-select" className="text-sm font-medium text-fg-muted">
            Canal (opcional)
          </label>
          <select
            id="upload-channel-select"
            value={uploadChannelId}
            onChange={(e) => {
              setUploadChannelId(e.target.value);
              setUploadChannelTouched(true);
            }}
            className="field-control w-full max-w-md"
          >
            <option value="">Nenhum</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-fg-subtle">
            Padrão: canal selecionado na barra lateral, ou o canal padrão da fonte (se houver).
          </p>
        </div>
      </section>

      <section aria-labelledby="step2-heading" className="flex flex-col gap-3">
        <h2 id="step2-heading" className="text-base font-semibold text-fg">
          2. Envie os arquivos
        </h2>

        <p className="border-warning/40 bg-warning-soft text-fg rounded-lg border p-3 text-xs">
          Só envie conteúdo cuja licença cadastrada cubra o uso pretendido.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploadDisabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            uploadDisabled
              ? "cursor-not-allowed border-border bg-surface-2 text-fg-subtle"
              : isDragging
                ? "border-info/40 bg-info-soft text-fg"
                : "border-border-strong bg-surface text-fg-muted"
          }`}
        >
          <p className="text-sm">
            {uploadDisabled
              ? "Selecione uma fonte acima para habilitar o envio."
              : "Arraste arquivos aqui ou use o seletor abaixo."}
          </p>
          <p className="text-xs text-fg-subtle">
            Formatos aceitos: {ACCEPTED_EXTENSIONS.join(", ")}
          </p>
          <label
            htmlFor="file-input"
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              uploadDisabled
                ? "cursor-not-allowed border-border text-fg-subtle"
                : "cursor-pointer border-border-strong text-fg-muted hover:bg-surface-2"
            }`}
          >
            Escolher arquivos
          </label>
          <input
            id="file-input"
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            disabled={uploadDisabled}
            onChange={handleFileInputChange}
            className="sr-only"
          />
        </div>

        {items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <UploadRow
                key={item.id}
                item={item}
                onPause={() => handlePause(item.id)}
                onResume={() => handleResume(item.id)}
                onCancel={() => handleCancel(item.id)}
              />
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="received-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="received-heading" className="text-base font-semibold text-fg">
            Uploads recebidos
          </h2>
          <Button variant="ghost" size="sm" onClick={() => loadAssets()}>
            Atualizar
          </Button>
        </div>

        {assetsLoading ? (
          <p className="text-sm text-fg-subtle">Carregando…</p>
        ) : assetsError ? (
          <p role="alert" className="text-sm text-danger">
            {assetsError}
          </p>
        ) : assets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-fg-muted">Nenhum upload recebido ainda. Escolha uma fonte acima e envie o primeiro vídeo.</p>
        ) : (
          <DataTable
            caption="Arquivos já recebidos pelo servidor"
            columns={assetColumns}
            rows={assets}
            rowKey={(a) => a.id}
            actions={(asset) => (
              <>
                <Button size="sm" onClick={() => setAnalyzeTarget(asset)}>
                  Analisar<span className="sr-only"> {asset.filename}</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setVideoTarget(asset)}>
                  Ver vídeo<span className="sr-only"> {asset.filename}</span>
                </Button>
                <MoreMenu
                  label={asset.filename}
                  items={[
                    {
                      label: "Trocar canal",
                      onSelect: () => {
                        setPendingChannelId(asset.channel_id ?? "");
                        setChannelChangeTarget(asset);
                      },
                    },
                  ]}
                />
              </>
            )}
          />
        )}
      </section>

      <AnalyzeDialog
        mediaAsset={analyzeTarget}
        channels={channels}
        onClose={() => setAnalyzeTarget(null)}
        onAnalyzed={() => {
          showToast("Análise iniciada. Acompanhe o progresso em Jobs.", "success");
          setAnalyzeTarget(null);
          loadAssets();
        }}
      />

      <Dialog
        open={videoTarget !== null}
        onClose={() => setVideoTarget(null)}
        title={videoTarget ? `Vídeo: ${videoTarget.filename}` : "Vídeo"}
        widthClassName="max-w-3xl"
      >
        {videoTarget ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- source video has no subtitle track guaranteed
          <video controls className="w-full rounded-lg bg-black" src={mediaAssetVideoUrl(videoTarget.id)} />
        ) : null}
      </Dialog>

      <Dialog
        open={channelChangeTarget !== null}
        onClose={() => setChannelChangeTarget(null)}
        title="Trocar canal"
      >
        {channelChangeTarget ? (
          <div className="flex flex-col gap-4">
            <label htmlFor="change-channel-select" className="text-sm font-medium text-fg-muted">
              Canal para {channelChangeTarget.filename}
            </label>
            <select
              id="change-channel-select"
              value={pendingChannelId}
              onChange={(e) => setPendingChannelId(e.target.value)}
              className="field-control w-full"
            >
              <option value="">Nenhum</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingChannel}
                onClick={async () => {
                  setSavingChannel(true);
                  try {
                    await updateMediaAsset(channelChangeTarget.id, {
                      channel_id: pendingChannelId || null,
                    });
                    showToast("Canal atualizado.", "success");
                    setChannelChangeTarget(null);
                    loadAssets();
                  } catch (err) {
                    showToast(
                      err instanceof ApiError ? err.message : "Erro ao trocar o canal.",
                      "error",
                    );
                  } finally {
                    setSavingChannel(false);
                  }
                }}
                className="btn btn-primary"
              >
                {savingChannel ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setChannelChangeTarget(null)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

const STATUS_LABELS: Record<UploadStatus, string> = {
  queued: "Na fila",
  uploading: "Enviando",
  paused: "Pausado",
  success: "Concluído",
  error: "Erro",
};

function UploadRow({
  item,
  onPause,
  onResume,
  onCancel,
}: {
  item: UploadItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const percent = item.totalBytes > 0 ? Math.min(100, (item.bytesUploaded / item.totalBytes) * 100) : 0;
  const remainingBytes = Math.max(0, item.totalBytes - item.bytesUploaded);
  const etaSeconds = item.speedBps > 0 ? remainingBytes / item.speedBps : null;

  return (
    <li className="rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-fg">
          {item.filename}
        </span>
        <span className="text-xs text-fg-subtle">
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso do envio de ${item.filename}`}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full transition-all ${
            item.status === "error" ? "bg-red-500" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
        <span>
          {formatBytes(item.bytesUploaded)} / {formatBytes(item.totalBytes)} ({percent.toFixed(0)}%)
        </span>
        {item.status === "uploading" ? (
          <span>
            {formatBytes(item.speedBps)}/s · ETA {etaSeconds !== null ? formatDuration(etaSeconds) : "—"}
          </span>
        ) : null}
      </div>

      {item.error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {item.error}
        </p>
      ) : null}

      <div className="mt-2 flex gap-3 text-xs font-medium">
        {item.status === "uploading" ? (
          <button type="button" onClick={onPause} className="text-primary-text hover:underline">
            Pausar
          </button>
        ) : null}
        {item.status === "paused" || item.status === "error" ? (
          <button type="button" onClick={onResume} className="text-primary-text hover:underline">
            Retomar
          </button>
        ) : null}
        {item.status !== "success" ? (
          <button type="button" onClick={onCancel} className="text-danger hover:underline">
            Cancelar
          </button>
        ) : null}
      </div>
    </li>
  );
}
