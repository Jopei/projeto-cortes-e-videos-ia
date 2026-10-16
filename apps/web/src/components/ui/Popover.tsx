"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type Placement = "bottom-start" | "bottom-end" | "top-start" | "right-start";

const ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), button:not([disabled]), a[href], select:not([disabled])';

/** Floating menu anchored to a trigger. Uses `position: fixed` so it is never
 * clipped by scrolling containers (tables, the sidebar). Esc closes and returns
 * focus to the trigger; arrow keys move between `menuitem`/`menuitemradio`. */
export function Popover({
  renderTrigger,
  children,
  placement = "bottom-start",
  minWidth,
  label,
  className = "",
}: {
  renderTrigger: (props: {
    ref: React.RefObject<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
  }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  placement?: Placement;
  minWidth?: number;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = Math.max(r.width, minWidth ?? 0);
    const style: React.CSSProperties = { minWidth: width };
    if (placement === "bottom-start") {
      style.top = r.bottom + 4;
      style.left = Math.min(r.left, window.innerWidth - width - 8);
    } else if (placement === "bottom-end") {
      style.top = r.bottom + 4;
      style.right = Math.max(8, window.innerWidth - r.right);
    } else if (placement === "top-start") {
      style.bottom = window.innerHeight - r.top + 4;
      style.left = Math.min(r.left, window.innerWidth - width - 8);
    } else {
      style.top = r.top;
      style.left = r.right + 8;
    }
    setPos(style);
  }, [open, placement, minWidth]);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items()[0] ?? menuRef.current)?.focus({ preventScroll: true });
    const openedAt = Date.now();

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if ((document.activeElement as HTMLElement | null)?.tagName === "SELECT") return;
      const list = items();
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        list[(idx + 1) % list.length].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        list[(idx - 1 + list.length) % list.length].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        list[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        list[list.length - 1].focus();
      }
    }
    function onScrollResize(e: Event) {
      if (Date.now() - openedAt < 300) return;
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [open]);

  return (
    <>
      {renderTrigger({
        ref: triggerRef,
        onClick: () => setOpen((o) => !o),
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined,
      })}
      {open ? (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && !menuRef.current?.contains(next) && !triggerRef.current?.contains(next)) setOpen(false);
          }}
          style={pos}
          className={`fixed z-[60] flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-pop focus:outline-none dark:ring-1 dark:ring-white/10 ${className}`}
        >
          {children(close)}
        </div>
      ) : null}
    </>
  );
}

/** A single row inside <Popover>. */
export function MenuItem({
  children,
  onSelect,
  danger = false,
  disabled = false,
  checked,
  icon,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** When defined, renders as a radio item (channel picker). */
  checked?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={`focus-ring flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "text-danger hover:bg-danger-soft"
          : checked
            ? "bg-primary-soft text-primary-text"
            : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
