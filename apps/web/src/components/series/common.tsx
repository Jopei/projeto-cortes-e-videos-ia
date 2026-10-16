"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export const inputClass =
  "field-control w-full";
export const labelClass = "text-sm font-medium text-fg-muted";
export const hintClass = "text-xs text-fg-subtle";
export const primaryButton =
  "btn btn-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
export const secondaryButton =
  "btn btn-secondary";
export const dangerButton =
  "btn btn-danger focus-visible:outline-red-500";
export const successButton =
  "btn btn-success focus-visible:outline-emerald-500 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
export const cardClass =
  "rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4";
export const linkClass = "font-medium text-primary-text hover:underline";

type Tone = "danger" | "warning" | "info" | "success";
const TONES: Record<Tone, string> = {
  danger: "border-danger/40 bg-danger-soft text-fg",
  warning: "border-warning/40 bg-warning-soft text-fg",
  info: "border-info/40 bg-info-soft text-fg",
  success: "border-success/40 bg-success-soft text-fg",
};

export function Notice({
  tone,
  children,
  role,
  action,
}: {
  tone: Tone;
  children: React.ReactNode;
  role?: "alert" | "status";
  action?: React.ReactNode;
}) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : undefined)}
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${TONES[tone]}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function LoadError({ message, onRetry, title }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <Notice
      tone="danger"
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className={secondaryButton}>
            Tentar novamente
          </button>
        ) : undefined
      }
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <p>{message}</p>
    </Notice>
  );
}

/** Shown when the /api/series/* routes answer 404 "Not Found" / 405 (not deployed yet). */
export function UnavailableNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      title="Recurso ainda indisponível"
      description="O servidor ainda não oferece esta parte das Séries IA. Tente novamente mais tarde."
      action={
        <div className="flex gap-2">
          {onRetry ? (
            <button type="button" onClick={onRetry} className={secondaryButton}>
              Tentar novamente
            </button>
          ) : null}
          <Link href="/cortes" className={secondaryButton}>
            Voltar ao painel
          </Link>
        </div>
      }
    />
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  counter,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  counter?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {counter}
      </div>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className={hintClass}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressMeter({
  value,
  max,
  label,
  tone,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "indigo" | "amber" | "red" | "emerald";
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const color =
    tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : tone === "emerald" ? "bg-emerald-500" : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-border"
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
