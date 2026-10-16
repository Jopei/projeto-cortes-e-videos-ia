"use client";

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
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
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-pop sm:p-8"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
          <Icon name="scissors" size={22} />
        </span>
        <h1
          id={`${formId}-heading`}
          className="text-xl font-semibold tracking-tight text-fg"
        >
          Projetos Cortes
        </h1>
        <p className="text-sm text-fg-subtle">Cortes verticais, direitos em dia. Entre para acessar o painel.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-fg"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${formId}-username`}
          className="text-sm font-medium text-fg"
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
          className="text-sm font-medium text-fg"
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
            className="focus-ring absolute inset-y-0 right-0 flex items-center rounded-lg px-3 text-sm font-medium text-primary-text hover:underline"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
            <span className="sr-only"> senha</span>
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary btn-lg mt-2"
      >
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

const inputClass =
  "field-control w-full";
