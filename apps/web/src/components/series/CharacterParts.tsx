"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHARACTER_ROLE_LABELS,
  referenceImageUrl,
  seriesApi,
  uploadReferenceImage,
  type Character,
  type CharacterRole,
  type SeriesDetail,
} from "@/lib/series";
import { seriesErrorMessage } from "@/lib/series-errors";
import { useProviders } from "@/lib/use-providers";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { CharacterStatusBadge } from "@/components/series/badges";
import { Field, Notice, dangerButton, hintClass, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/series/common";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function CharacterAvatar({ seriesId, character, version }: { seriesId: string; character: Character; version?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [version, character.has_reference_image]);
  const dead = character.status === "dead";
  return (
    <span className="relative flex h-24 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-border text-sm font-semibold text-fg-muted">
      {character.has_reference_image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated endpoint, next/image can't proxy cookies
        <img
          src={referenceImageUrl(seriesId, character.id, version)}
          alt={`Referência visual de ${character.name}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${dead ? "grayscale" : ""}`}
        />
      ) : (
        <span aria-hidden="true" className={dead ? "grayscale" : ""}>
          {initials(character.name)}
        </span>
      )}
      {dead ? (
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-xs text-white">
          ✝
        </span>
      ) : null}
    </span>
  );
}

export function CharacterCard({
  seriesId,
  character: c,
  imageVersion,
  onEdit,
  onImage,
}: {
  seriesId: string;
  character: Character;
  imageVersion?: number;
  onEdit: () => void;
  onImage: () => void;
}) {
  const lastEvent = [...c.events].filter((e) => e.state !== "discarded" && e.to_status && e.to_status !== "alive").sort((a, b) => b.episode_number - a.episode_number)[0];
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-3">
      <CharacterAvatar seriesId={seriesId} character={c} version={imageVersion} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CharacterStatusBadge status={c.status} />
          {!c.committed ? <Badge variant="neutral" className="border-dashed">Proposto</Badge> : null}
        </div>
        <p className="text-sm font-semibold text-fg">
          {c.name} <span className="font-normal text-fg-subtle">· {CHARACTER_ROLE_LABELS[c.role] ?? c.role}</span>
        </p>
        {c.introduced_in_episode != null ? <p className="text-xs text-fg-subtle">Introduzida no Ep. {c.introduced_in_episode}</p> : null}
        <p className="line-clamp-2 text-xs text-fg-muted">{c.description}</p>
        {lastEvent ? (
          <p className="text-xs text-fg-muted">
            Ep. {lastEvent.episode_number}: {lastEvent.description || lastEvent.to_status}
            {lastEvent.state === "proposed" ? " (proposto)" : ""}
          </p>
        ) : null}
        <div className="mt-1 flex gap-3 text-sm font-medium">
          <button type="button" onClick={onEdit} className="text-primary-text hover:underline">
            Editar
          </button>
          <button type="button" onClick={onImage} className="text-primary-text hover:underline">
            Imagem de ref.
          </button>
        </div>
      </div>
    </li>
  );
}

export function CharacterEditDialog({
  seriesId,
  character,
  onClose,
  onSaved,
}: {
  seriesId: string;
  character: Character;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(character.name);
  const [role, setRole] = useState<CharacterRole>(character.role);
  const [description, setDescription] = useState(character.description);
  const [visual, setVisual] = useState(character.visual_description);
  const [personality, setPersonality] = useState(character.personality ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await seriesApi.patchCharacter(seriesId, character.id, {
        name: name.trim(),
        role,
        description,
        visual_description: visual,
        personality: personality || null,
      });
      showToast("Personagem salvo.", "success");
      await onSaved();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível salvar o personagem."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Editar ${character.name}`} widthClassName="max-w-xl">
      <form onSubmit={save} className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="char-name" label="Nome">
            <input id="char-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field id="char-role" label="Papel">
            <select id="char-role" value={role} onChange={(e) => setRole(e.target.value as CharacterRole)} className={inputClass}>
              {(Object.keys(CHARACTER_ROLE_LABELS) as CharacterRole[]).map((r) => (
                <option key={r} value={r}>
                  {CHARACTER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="char-desc" label="Descrição">
          <textarea id="char-desc" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
        <Field id="char-visual" label="Descrição visual" hint="Vai em todo prompt de imagem/vídeo. Mantenha idade aparente, cabelo e roupa fixos.">
          <textarea id="char-visual" rows={3} minLength={80} maxLength={400} value={visual} onChange={(e) => setVisual(e.target.value)} className={inputClass} aria-describedby="char-visual-hint" />
        </Field>
        <Field id="char-personality" label="Personalidade">
          <textarea id="char-personality" rows={2} value={personality} onChange={(e) => setPersonality(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Status</span>
          <div>
            <CharacterStatusBadge status={character.status} />
          </div>
          <p className={hintClass}>O status só muda por eventos dos episódios aprovados.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ReferenceImageDialog({
  series,
  character,
  imageVersion,
  onClose,
  onChanged,
}: {
  series: SeriesDetail;
  character: Character;
  imageVersion?: number;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const providers = useProviders().data;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [hasImage, setHasImage] = useState(character.has_reference_image);
  const [version, setVersion] = useState(imageVersion);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const imgProvider = providers?.image.find((p) => p.id === series.image_provider);
  const vidProvider = providers?.video.find((p) => p.id === series.video_provider);
  const ignoresRefs =
    providers != null &&
    (imgProvider ? !imgProvider.supports_reference_images : false) &&
    (series.visual_strategy === "economy" || !vidProvider || !vidProvider.supports_reference_images);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("Formato não aceito. Use PNG, JPEG ou WebP.");
      setFile(null);
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setError("Imagem maior que 5 MB.");
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadReferenceImage(series.id, character.id, file);
      showToast("Imagem de referência salva.", "success");
      setFile(null);
      setHasImage(true);
      setVersion(Date.now());
      await onChanged();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível enviar a imagem."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await seriesApi.deleteReferenceImage(series.id, character.id);
      showToast("Imagem de referência removida.", "success");
      setHasImage(false);
      setConfirmRemove(false);
      await onChanged();
    } catch (err) {
      setError(seriesErrorMessage(err, "Não foi possível remover a imagem."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Imagem de referência — ${character.name}`}>
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {ignoresRefs ? (
          <Notice tone="warning" role="status">
            O provedor escolhido ignora imagens de referência.
          </Notice>
        ) : null}
        <div className="flex items-start gap-4">
          <CharacterAvatar seriesId={series.id} character={{ ...character, has_reference_image: hasImage }} version={version} />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={preview} alt="Prévia da nova imagem" className="h-24 w-14 rounded-lg object-cover" />
          ) : null}
        </div>
        <p className={hintClass}>
          Ajuda a manter o mesmo rosto entre cenas, em provedores que aceitam referências. Você deve ter direito de usar a imagem; não envie fotos de pessoas
          reais sem autorização.
        </p>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} className="sr-only" aria-label="Escolher imagem" id="ref-image-input" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className={secondaryButton}>
            Enviar imagem
          </button>
          {file ? (
            <button type="button" onClick={upload} disabled={busy} className={primaryButton}>
              {busy ? "Enviando…" : "Salvar"}
            </button>
          ) : null}
          {hasImage && !file ? (
            <button type="button" onClick={() => setConfirmRemove(true)} className={secondaryButton}>
              Remover imagem
            </button>
          ) : null}
        </div>
        {confirmRemove ? (
          <Notice
            tone="warning"
            action={
              <div className="flex gap-2">
                <button type="button" data-autofocus onClick={() => setConfirmRemove(false)} className={secondaryButton}>
                  Voltar
                </button>
                <button type="button" onClick={remove} disabled={busy} className={dangerButton}>
                  Remover
                </button>
              </div>
            }
          >
            Remover a imagem de referência de {character.name}?
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}
