"use client";

import * as React from "react";
import { useId, useState } from "react";
import {
  ALLOWED_PLATFORM_OPTIONS,
  LICENSE_TYPE_LABELS,
  SELECTABLE_LICENSE_TYPES,
  type LicenseType,
  type Source,
  type SourceInput,
} from "@/lib/sources";
import { ApiError, formatApiErrorDetail } from "@/lib/api";

const PLATFORM_LABELS: Record<(typeof ALLOWED_PLATFORM_OPTIONS)[number], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  bilibili: "Bilibili",
  instagram: "Instagram",
  facebook: "Facebook",
  vimeo: "Vimeo",
};

type FormState = {
  title: string;
  work_name: string;
  license_type: LicenseType;
  proof_url: string;
  allowed_platforms: string[];
  territories: string;
  valid_from: string;
  valid_until: string;
  monetization_allowed: boolean;
  attribution_text: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  work_name: "",
  license_type: "public_domain",
  proof_url: "",
  allowed_platforms: [],
  territories: "",
  valid_from: "",
  valid_until: "",
  monetization_allowed: false,
  attribution_text: "",
};

function sourceToForm(source: Source): FormState {
  return {
    title: source.title,
    work_name: source.work_name,
    license_type: source.license_type,
    proof_url: source.proof_url ?? "",
    allowed_platforms: source.allowed_platforms,
    territories: source.territories.join(", "),
    valid_from: source.valid_from ? source.valid_from.slice(0, 10) : "",
    valid_until: source.valid_until ? source.valid_until.slice(0, 10) : "",
    monetization_allowed: source.monetization_allowed,
    attribution_text: source.attribution_text ?? "",
  };
}

function formToPayload(form: FormState): SourceInput {
  return {
    title: form.title.trim(),
    work_name: form.work_name.trim(),
    license_type: form.license_type,
    proof_url: form.proof_url.trim() || null,
    allowed_platforms: form.allowed_platforms,
    territories: form.territories
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean),
    valid_from: form.valid_from || null,
    valid_until: form.valid_until || null,
    monetization_allowed: form.monetization_allowed,
    attribution_text: form.attribution_text.trim() || null,
  };
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.title.trim()) errors.title = "Informe o título.";
  if (!form.work_name.trim()) errors.work_name = "Informe o nome da obra.";
  if (form.license_type === "licensed" && !form.proof_url.trim()) {
    errors.proof_url = "Obrigatório para licenças do tipo \"Licenciado\".";
  }
  if (
    (form.license_type === "cc_by" || form.license_type === "cc_by_sa") &&
    !form.attribution_text.trim()
  ) {
    errors.attribution_text = "Obrigatório para licenças CC-BY / CC-BY-SA.";
  }
  if (form.valid_from && form.valid_until && form.valid_from > form.valid_until) {
    errors.valid_until = "Data final não pode ser anterior à data inicial.";
  }
  return errors;
}

type SourceFormProps = {
  source?: Source;
  onSubmit: (payload: SourceInput) => Promise<void>;
  onCancel: () => void;
};

export function SourceForm({ source, onSubmit, onCancel }: SourceFormProps) {
  const [form, setForm] = useState<FormState>(source ? sourceToForm(source) : EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formId = useId();
  const isEditing = Boolean(source);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(platform: string) {
    setForm((prev) => ({
      ...prev,
      allowed_platforms: prev.allowed_platforms.includes(platform)
        ? prev.allowed_platforms.filter((p) => p !== platform)
        : [...prev.allowed_platforms, platform],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(formToPayload(form));
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.detail ? formatApiErrorDetail(err.detail) : err.message);
      } else {
        setServerError("Erro inesperado ao salvar a fonte.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const needsAttribution = form.license_type === "cc_by" || form.license_type === "cc_by_sa";

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={isEditing ? "Editar fonte" : "Nova fonte"}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
        {isEditing ? "Editar fonte" : "Nova fonte"}
      </h2>

      {serverError ? (
        <div
          role="alert"
          className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
        >
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${formId}-title`}
          label="Título"
          required
          error={errors.title}
        >
          <input
            id={`${formId}-title`}
            type="text"
            required
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          id={`${formId}-work_name`}
          label="Nome da obra"
          required
          error={errors.work_name}
        >
          <input
            id={`${formId}-work_name`}
            type="text"
            required
            value={form.work_name}
            onChange={(e) => update("work_name", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id={`${formId}-license_type`} label="Tipo de licença" required>
          <select
            id={`${formId}-license_type`}
            required
            value={form.license_type}
            onChange={(e) => update("license_type", e.target.value as LicenseType)}
            className={inputClass}
          >
            {SELECTABLE_LICENSE_TYPES.map((type) => (
              <option key={type} value={type}>
                {LICENSE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={`${formId}-proof_url`}
          label="URL de comprovação"
          error={errors.proof_url}
          hint={form.license_type === "licensed" ? "Obrigatório para licenças \"Licenciado\"." : undefined}
        >
          <input
            id={`${formId}-proof_url`}
            type="url"
            value={form.proof_url}
            onChange={(e) => update("proof_url", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id={`${formId}-valid_from`} label="Válido a partir de">
          <input
            id={`${formId}-valid_from`}
            type="date"
            value={form.valid_from}
            onChange={(e) => update("valid_from", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          id={`${formId}-valid_until`}
          label="Válido até"
          error={errors.valid_until}
        >
          <input
            id={`${formId}-valid_until`}
            type="date"
            value={form.valid_until}
            onChange={(e) => update("valid_until", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          id={`${formId}-territories`}
          label="Territórios"
          hint="Códigos separados por vírgula, ex.: BR, US"
        >
          <input
            id={`${formId}-territories`}
            type="text"
            placeholder="BR, US"
            value={form.territories}
            onChange={(e) => update("territories", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Plataformas permitidas
        </legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {ALLOWED_PLATFORM_OPTIONS.map((platform) => (
            <label
              key={platform}
              className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
            >
              <input
                type="checkbox"
                checked={form.allowed_platforms.includes(platform)}
                onChange={() => togglePlatform(platform)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600"
              />
              {PLATFORM_LABELS[platform]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={form.monetization_allowed}
          onChange={(e) => update("monetization_allowed", e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600"
        />
        Monetização permitida
      </label>

      <Field
        id={`${formId}-attribution_text`}
        label="Texto de atribuição"
        error={errors.attribution_text}
        hint={needsAttribution ? "Obrigatório para licenças CC-BY / CC-BY-SA." : undefined}
      >
        <textarea
          id={`${formId}-attribution_text`}
          rows={3}
          value={form.attribution_text}
          onChange={(e) => update("attribution_text", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Salvando…" : isEditing ? "Salvar alterações" : "Criar fonte"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50";

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
};

function Field({ id, label, required, error, hint, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
            "aria-invalid": error ? true : undefined,
          })
        : children}
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
