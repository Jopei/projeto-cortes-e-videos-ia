"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50";
export const labelClass = "text-sm font-medium text-slate-700 dark:text-slate-200";
export const hintClass = "text-xs text-slate-500 dark:text-slate-400";
export const primaryButton =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
export const secondaryButton =
  "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
export const dangerButton =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-60";
export const successButton =
  "rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
export const cardClass =
  "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950";
export const linkClass = "font-medium text-indigo-600 hover:underline dark:text-indigo-400";

type Tone = "danger" | "warning" | "info" | "success";
const TONES: Record<Tone, string> = {
  danger: "border-red-400 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200",
  warning: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200",
  info: "border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-200",
  success: "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200",
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
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm ${TONES[tone]}`}
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
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
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
    tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : tone === "emerald" ? "bg-emerald-500" : "bg-indigo-600";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
