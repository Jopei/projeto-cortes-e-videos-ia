"use client";

import { useEffect, useId, useRef } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
  /** "drawer": right-hand panel on md+, full screen on mobile. Same focus/Esc/backdrop behavior. */
  variant?: "center" | "drawer";
  /** Optional element rendered next to the title (e.g. prev/next navigation). */
  headerExtra?: React.ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last: only the top one reacts to Esc/Tab, and the
 * body scroll lock is released only when the last one closes (drawer + nested dialog). */
const openStack: symbol[] = [];

/** Accessible modal: traps focus, closes on Esc/backdrop click, restores
 * focus to the trigger element on close. No external deps. */
export function Dialog({ open, onClose, title, children, widthClassName, variant = "center", headerExtra }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const token = Symbol("dialog");
    openStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = containerRef.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    // `data-autofocus` marks the safe button of confirmation dialogs.
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0];
    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const idx = openStack.indexOf(token);
      if (idx >= 0) openStack.splice(idx, 1);
      if (openStack.length === 0) document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const isDrawer = variant === "drawer";

  return (
    <div className={`fixed inset-0 z-50 flex ${isDrawer ? "items-stretch justify-end" : "items-center justify-center p-4"}`}>
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          isDrawer
            ? `relative z-10 h-full w-full overflow-y-auto bg-white p-4 shadow-2xl shadow-black/40 ring-1 ring-black/5 dark:bg-slate-800 dark:shadow-black/70 dark:ring-white/10 sm:p-6 md:border-l md:border-slate-200 md:dark:border-slate-600 ${
                widthClassName ?? "md:max-w-3xl"
              }`
            : `relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/40 ring-1 ring-black/5 dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/70 dark:ring-white/10 ${
                widthClassName ?? "max-w-lg"
              }`
        }
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar diálogo"
              className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
