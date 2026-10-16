"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IntegrationHelp } from "@/lib/integration-help";
import { useToast } from "@/components/ui/Toast";

/**
 * Small info trigger next to a platform name that opens an anchored popover
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
        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg focus-ring"
      >
        <Icon name="info" size={14} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`Como obter as chaves do ${help.platformLabel}`}
          className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[85vw] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none p-4 text-sm shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:shadow-black/60 dark:ring-white/10"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-fg">
              Como obter as chaves — {help.platformLabel}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <ol className="list-decimal space-y-1.5 pl-4 text-fg-muted">
            {help.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          {help.notes?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-fg-subtle">
              {help.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}

          {redirectUri ? (
            <div className="mt-3 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-2">
              <span className="text-xs font-medium text-fg-muted">
                Cadastre exatamente esta URL no painel da plataforma:
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-fg">{redirectUri}</code>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="btn btn-secondary btn-sm shrink-0"
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
                  className="text-xs font-medium text-primary-text hover:underline"
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
