"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastVariant = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { action?: ToastAction; duration?: number };
type ToastItem = { id: string; message: string; variant: ToastVariant; action?: ToastAction };

type ToastContextValue = {
  /** Returns the toast id. Errors stay 8s, others 5s, unless `duration` is given. */
  showToast: (message: string, variant?: ToastVariant, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASSES: Record<ToastVariant, { bar: string; icon: IconName; color: string }> = {
  success: { bar: "bg-success", icon: "checkCircle", color: "text-success" },
  error: { bar: "bg-danger", icon: "alert", color: "text-danger" },
  info: { bar: "bg-info", icon: "info", color: "text-info" },
};

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", options: ToastOptions = {}) => {
      const id = randomId();
      setToasts((prev) => [...prev, { id, message, variant, action: options.action }]);
      const duration = options.duration ?? (variant === "error" ? 8000 : 5000);
      timers.current.set(
        id,
        window.setTimeout(() => dismissToast(id), duration),
      );
      return id;
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-stretch gap-2 sm:left-auto sm:right-4 sm:w-96"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface py-3 pl-5 pr-3 text-sm text-fg shadow-pop dark:ring-1 dark:ring-white/10"
          >
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${VARIANT_CLASSES[t.variant].bar}`} />
            <Icon name={VARIANT_CLASSES[t.variant].icon} className={`mt-0.5 ${VARIANT_CLASSES[t.variant].color}`} />
            <span className="min-w-0 flex-1 py-0.5">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="focus-ring inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-semibold text-primary-text hover:bg-surface-2"
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Fechar aviso"
              className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
