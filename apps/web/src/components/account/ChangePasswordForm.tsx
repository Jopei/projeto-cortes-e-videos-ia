"use client";

import { useState } from "react";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import { MIN_PASSWORD_LENGTH, changePassword } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";

const inputClass =
  "field-control w-full";
const labelClass = "text-sm font-medium text-fg-muted";

export function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      showToast("Senha alterada com sucesso.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Senha atual incorreta."
            : err.detail
              ? formatApiErrorDetail(err.detail)
              : err.message
          : "Erro inesperado ao trocar a senha.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="border-danger/40 bg-danger-soft text-fg rounded-lg border p-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="current-password" className={labelClass}>
          Senha atual
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className={labelClass}>
          Nova senha
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-fg-subtle">
          Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirm-password" className={labelClass}>
          Confirmar nova senha
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary"
        >
          {submitting ? "Salvando…" : "Trocar senha"}
        </button>
      </div>
    </form>
  );
}
