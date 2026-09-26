"use client";

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { login, sanitizeNextPath } from "@/lib/auth";

function errorMessageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Usuário ou senha inválidos.";
    if (err.status === 429) {
      return "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.";
    }
    return err.message || "Não foi possível entrar. Tente novamente.";
  }
  return "Não foi possível entrar. Tente novamente.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
      const next = sanitizeNextPath(searchParams.get("next")) ?? "/cortes/upload";
      router.replace(next);
    } catch (err) {
      setError(errorMessageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={`${formId}-heading`}
      className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-950"
    >
      <div className="flex flex-col gap-1 text-center">
        <h1
          id={`${formId}-heading`}
          className="text-lg font-semibold text-slate-900 dark:text-slate-50"
        >
          Projetos Cortes
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Entre para acessar o painel.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${formId}-username`}
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Usuário
        </label>
        <input
          id={`${formId}-username`}
          type="text"
          name="username"
          autoComplete="username"
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${formId}-password`}
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Senha
        </label>
        <div className="relative">
          <input
            id={`${formId}-password`}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-16`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((show) => !show)}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-indigo-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
            <span className="sr-only"> senha</span>
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50";
