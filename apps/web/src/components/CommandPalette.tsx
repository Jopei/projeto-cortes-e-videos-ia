"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { navGroups } from "@/lib/nav";
import { useAuth } from "@/lib/user-context";

type Entry = { href: string; label: string; hint: string; icon: IconName };

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Ctrl/Cmd+K navigation palette. Only lists screens the current profile may open
 * (the admin group is filtered like the sidebar). Combobox pattern: ArrowUp/Down, Enter, Esc. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const base: Entry[] = navGroups
      .filter((g) => !g.adminOnly || user?.is_admin)
      .flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, hint: g.label ?? "Início", icon: i.icon })));
    base.push(
      { href: "/series/nova", label: "Nova série", hint: "Ação", icon: "plus" },
      { href: "/conta", label: "Minha conta", hint: "Conta", icon: "user" },
    );
    return base;
  }, [user?.is_admin]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return entries;
    return entries.filter((e) => normalize(`${e.label} ${e.hint}`).includes(q));
  }, [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Ir para…" widthClassName="max-w-lg">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            data-autofocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label="Buscar tela"
            placeholder="Buscar tela ou ação…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="field-control w-full pl-9"
          />
        </div>
        {results.length === 0 ? (
          <p className="px-1 py-4 text-center text-sm text-fg-muted">Nada encontrado para “{query}”.</p>
        ) : (
          <ul ref={listRef} id={listId} role="listbox" aria-label="Telas" className="max-h-72 overflow-y-auto">
            {results.map((e, i) => (
              <li
                key={e.href}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(e)}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  i === active ? "bg-primary-soft text-primary-text" : "text-fg-muted"
                }`}
              >
                <Icon name={e.icon} />
                <span className="flex-1 font-medium">{e.label}</span>
                <span className="text-xs text-fg-subtle">{e.hint}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-center gap-3 border-t border-border pt-3 text-xs text-fg-subtle">
          <span><kbd className="font-semibold">↑</kbd> <kbd className="font-semibold">↓</kbd> navegar</span>
          <span><kbd className="font-semibold">Enter</kbd> abrir</span>
          <span><kbd className="font-semibold">Esc</kbd> fechar</span>
        </p>
      </div>
    </Dialog>
  );
}
