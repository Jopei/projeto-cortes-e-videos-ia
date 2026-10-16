"use client";

import { useRef } from "react";

export type TabItem<T extends string> = { id: T; label: string; badge?: React.ReactNode };

/** Accessible tablist (arrow keys, Home/End). The caller renders the panel and
 * should give it `role="tabpanel"` with `aria-labelledby={`tab-${id}`}`. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab, i) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            id={`tab-${tab.id}`}
            role="tab"
            aria-controls={`panel-${tab.id}`}
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`focus-ring -mb-px inline-flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors md:min-h-0 ${
              active
                ? "border-primary text-primary-text"
                : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg"
            }`}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
