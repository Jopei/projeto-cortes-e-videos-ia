"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: string; message: string; variant: ToastVariant };

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
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

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = randomId();
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-stretch gap-2 sm:left-auto sm:right-4 sm:w-96"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface py-3 pl-5 pr-4 text-sm text-fg shadow-pop dark:ring-1 dark:ring-white/10"
          >
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${VARIANT_CLASSES[t.variant].bar}`} />
            <Icon name={VARIANT_CLASSES[t.variant].icon} className={`mt-0.5 ${VARIANT_CLASSES[t.variant].color}`} />
            <span className="min-w-0 flex-1">{t.message}</span>
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
