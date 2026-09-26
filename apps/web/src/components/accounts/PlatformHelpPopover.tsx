"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { IntegrationHelp } from "@/lib/integration-help";
import { useToast } from "@/components/ui/Toast";

/**
 * Small "ⓘ" trigger next to a platform name that opens an anchored popover
 * with step-by-step instructions on where to get API keys, plus the
 * redirect URI to register (copy button). Closes on Esc or outside click.
 * No portal/positioning library — clamps a fixed-position panel to the
 * viewport, which keeps it usable on both desktop and mobile.
 */
export function PlatformHelpPopover({
  help,
  redirectUri,
}: {
  help: IntegrationHelp;
  redirectUri?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // Focus the panel's first focusable element (its close button).
    const first = panelRef.current?.querySelector<HTMLElement>("button, a[href]");
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleCopyRedirect() {
    if (!redirectUri) return;
    try {
      await navigator.clipboard.writeText(redirectUri);
      showToast("Redirect URI copiada.", "success");
    } catch {
      showToast("Não foi possível copiar automaticamente — selecione e copie manualmente.", "error");
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label={`Como obter as chaves do ${help.platformLabel}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <span aria-hidden="true">ⓘ</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`Como obter as chaves do ${help.platformLabel}`}
          className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[85vw] max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/60 dark:ring-white/10"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              Como obter as chaves — {help.platformLabel}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <ol className="list-decimal space-y-1.5 pl-4 text-slate-700 dark:text-slate-200">
            {help.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          {help.notes?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-500 dark:text-slate-400">
              {help.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}

          {redirectUri ? (
            <div className="mt-3 flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Cadastre exatamente esta URL no painel da plataforma:
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-slate-800 dark:text-slate-100">{redirectUri}</code>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Copiar
                </button>
              </div>
            </div>
          ) : null}

          {help.links.length ? (
            <div className="mt-3 flex flex-col gap-1">
              {help.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
