"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/format";
import type { RegenerateScope } from "@/lib/series";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Notice, dangerButton, hintClass, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/series/common";

const SCOPES: { value: RegenerateScope; label: string; hint: string }[] = [
  { value: "script", label: "Só o roteiro", hint: "Custo baixo (texto). Volta para validação e invalida a mídia já gerada." },
  { value: "media", label: "Só a mídia (imagens e vídeo)", hint: "Gera imagens e vídeo de novo com o mesmo roteiro." },
  { value: "narration", label: "Só a narração", hint: "Custo baixo (voz). Mantém imagens e vídeo." },
];

function ScopePicker({ value, onChange, mediaCost, name }: { value: RegenerateScope; onChange: (s: RegenerateScope) => void; mediaCost: number | null; name: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>O que regenerar</legend>
      {SCOPES.map((s) => (
        <label key={s.value} className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="radio" name={name} checked={value === s.value} onChange={() => onChange(s.value)} className="mt-0.5 h-4 w-4" />
          <span>
            {s.label}
            <span className={`block ${hintClass}`}>
              {s.hint}
              {s.value === "media" && mediaCost != null ? ` Custo estimado: até ${formatUsd(mediaCost)}.` : ""}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function costLabel(scope: RegenerateScope, mediaCost: number | null): string {
  return scope === "media" && mediaCost != null ? `custa até ${formatUsd(mediaCost)}` : "custo baixo";
}

export function RegenerateDialog({
  used,
  limit,
  mediaCost,
  defaultScope = "script",
  busy,
  error,
  onClose,
  onConfirm,
}: {
  used: number;
  limit: number;
  mediaCost: number | null;
  defaultScope?: RegenerateScope;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (scope: RegenerateScope, instructions: string) => void;
}) {
  const [scope, setScope] = useState<RegenerateScope>(defaultScope);
  const [instructions, setInstructions] = useState("");
  const atLimit = used >= limit;
  return (
    <Dialog open onClose={onClose} title="Regenerar episódio">
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <ScopePicker value={scope} onChange={setScope} mediaCost={mediaCost} name="regen-scope" />
        <Field id="regen-instructions" label="Instruções (opcional)" counter={<span className="text-xs text-slate-500">{instructions.length}/500</span>}>
          <textarea id="regen-instructions" rows={3} maxLength={500} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={inputClass} />
        </Field>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Regenerações usadas: {used} de {limit}
        </p>
        {atLimit ? (
          <Notice tone="warning" role="status">
            Limite de regenerações deste episódio atingido. Edite o roteiro manualmente ou aumente o limite na configuração da série.
          </Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button type="button" disabled={atLimit || busy} onClick={() => onConfirm(scope, instructions.trim())} className={primaryButton}>
            {busy ? "Regenerando…" : `Regenerar (${costLabel(scope, mediaCost)})`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function RejectDialog({
  mediaCost,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  mediaCost: number | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (body: { instructions?: string; regenerate: boolean; scope?: RegenerateScope }) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [regenerate, setRegenerate] = useState(true);
  const [scope, setScope] = useState<RegenerateScope>("media");
  return (
    <Dialog open onClose={onClose} title="Rejeitar episódio">
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="text-sm text-slate-700 dark:text-slate-200">Rejeitar não publica o episódio e libera a agenda +1 dia se passar do horário.</p>
        <Field id="reject-instructions" label="Instruções (opcional)" hint="O que não ficou bom? A IA usa isso na próxima tentativa.">
          <textarea id="reject-instructions" rows={3} maxLength={500} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={inputClass} aria-describedby="reject-instructions-hint" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} className="h-4 w-4" />
          Regenerar em seguida
        </label>
        {regenerate ? <ScopePicker value={scope} onChange={setScope} mediaCost={mediaCost} name="reject-scope" /> : null}
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm({ instructions: instructions.trim() || undefined, regenerate, scope: regenerate ? scope : undefined })}
            className={dangerButton}
          >
            {busy ? "Rejeitando…" : "Rejeitar"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function UnapproveDialog({
  number,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  number: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title={`Desaprovar Ep. ${number}`}>
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="text-sm text-slate-700 dark:text-slate-200">
          O episódio volta para revisão, as publicações agendadas serão canceladas, os eventos de personagem voltam a propostos e os episódios seguintes ficam
          Desatualizados.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className={secondaryButton}>
            Voltar
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={dangerButton}>
            {busy ? "Desaprovando…" : "Desaprovar"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
