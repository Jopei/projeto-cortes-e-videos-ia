"use client";

import { useState } from "react";
import { ApiError, formatApiErrorDetail } from "@/lib/api";
import type { PostingWindow, PlatformAccount, PlatformAccountUpdateInput } from "@/lib/accounts";
import { WEEKDAY_LABELS } from "@/lib/accounts";
import type { Channel, TemplateParams } from "@/lib/channels";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50";
const labelClass = "text-sm font-medium text-slate-700 dark:text-slate-200";

function PostingWindowsEditor({
  windows,
  onChange,
}: {
  windows: PostingWindow[];
  onChange: (windows: PostingWindow[]) => void;
}) {
  function updateWindow(index: number, patch: Partial<PostingWindow>) {
    onChange(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }
  function toggleDay(index: number, day: number) {
    const current = windows[index].days;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    updateWindow(index, { days: next });
  }
  function addWindow() {
    onChange([...windows, { days: [0, 1, 2, 3, 4], start: "09:00", end: "18:00" }]);
  }
  function removeWindow(index: number) {
    onChange(windows.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      {windows.map((w, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(index, day)}
                aria-pressed={w.days.includes(day)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  w.days.includes(day)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">
              Das
              <input
                type="time"
                value={w.start}
                onChange={(e) => updateWindow(index, { start: e.target.value })}
                className="ml-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-slate-400">
              às
              <input
                type="time"
                value={w.end}
                onChange={(e) => updateWindow(index, { end: e.target.value })}
                className="ml-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <button
              type="button"
              onClick={() => removeWindow(index)}
              className="ml-auto text-xs font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Remover janela
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addWindow}
        className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        + Adicionar janela de postagem
      </button>
    </div>
  );
}

export function AccountForm({
  account,
  channels,
  onSubmit,
  onCancel,
}: {
  account: PlatformAccount;
  channels: Channel[];
  onSubmit: (payload: PlatformAccountUpdateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(account.display_name);
  const [channelId, setChannelId] = useState(account.channel_id ?? "");
  const [dailyLimit, setDailyLimit] = useState(account.daily_limit != null ? String(account.daily_limit) : "");
  const [windows, setWindows] = useState<PostingWindow[]>(account.posting_windows ?? []);
  const [timezone, setTimezone] = useState(account.timezone);
  const [monetized, setMonetized] = useState(account.monetized);
  const [templateLanguage, setTemplateLanguage] = useState(account.template?.language ?? "");
  const [templateTone, setTemplateTone] = useState(account.template?.tone ?? "");
  const [templateHashtags, setTemplateHashtags] = useState(account.template?.fixed_hashtags?.join(", ") ?? "");
  const [templateTitleMax, setTemplateTitleMax] = useState(
    account.template?.title_max != null ? String(account.template.title_max) : "",
  );
  const [templateExtraDescription, setTemplateExtraDescription] = useState(
    account.template?.extra_description ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const template: TemplateParams = {
      language: templateLanguage || undefined,
      tone: templateTone || undefined,
      fixed_hashtags: templateHashtags
        ? templateHashtags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      title_max: templateTitleMax ? Number(templateTitleMax) : undefined,
      extra_description: templateExtraDescription || undefined,
    };

    setSubmitting(true);
    try {
      await onSubmit({
        display_name: displayName,
        channel_id: channelId || null,
        daily_limit: dailyLimit ? Number(dailyLimit) : null,
        posting_windows: windows,
        timezone,
        monetized,
        template,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Este canal já tem uma conta cadastrada para esta plataforma.");
      } else {
        setError(
          err instanceof ApiError
            ? err.detail
              ? formatApiErrorDetail(err.detail)
              : err.message
            : "Erro inesperado ao salvar a conta.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-md border border-red-400 bg-red-50 p-2 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="account-display-name" className={labelClass}>
          Nome de exibição
        </label>
        <input
          id="account-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="account-channel" className={labelClass}>
          Canal vinculado
        </label>
        <select id="account-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} className={inputClass}>
          <option value="">Nenhum</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="account-daily-limit" className={labelClass}>
            Limite diário de posts
          </label>
          <input
            id="account-daily-limit"
            type="number"
            min={0}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="account-timezone" className={labelClass}>
            Fuso horário
          </label>
          <input
            id="account-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/Sao_Paulo"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="account-monetized"
          type="checkbox"
          checked={monetized}
          onChange={(e) => setMonetized(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <label htmlFor="account-monetized" className={labelClass}>
          Conta monetizada
        </label>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        Contas monetizadas têm mais restrições no crivo de direitos autorais (ex.: bloqueiam
        licenças CC BY-NC).
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Janelas de postagem</legend>
        <PostingWindowsEditor windows={windows} onChange={setWindows} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className={labelClass}>Template específico da conta</legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="account-template-language" className={labelClass}>
            Idioma
          </label>
          <input
            id="account-template-language"
            value={templateLanguage}
            onChange={(e) => setTemplateLanguage(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="account-template-tone" className={labelClass}>
            Tom
          </label>
          <input
            id="account-template-tone"
            value={templateTone}
            onChange={(e) => setTemplateTone(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="account-template-title-max" className={labelClass}>
            Limite de título
          </label>
          <input
            id="account-template-title-max"
            type="number"
            min={1}
            value={templateTitleMax}
            onChange={(e) => setTemplateTitleMax(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="account-template-hashtags" className={labelClass}>
            Hashtags fixas
          </label>
          <input
            id="account-template-hashtags"
            value={templateHashtags}
            onChange={(e) => setTemplateHashtags(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="account-template-extra" className={labelClass}>
            Texto extra de descrição
          </label>
          <textarea
            id="account-template-extra"
            rows={3}
            value={templateExtraDescription}
            onChange={(e) => setTemplateExtraDescription(e.target.value)}
            className={inputClass}
          />
        </div>
      </fieldset>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
