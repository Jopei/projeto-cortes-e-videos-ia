"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** `variant="row"`: full-width labelled row (user menu, login). `variant="icon"`: 40px icon button. */
export function ThemeToggle({ variant = "row" }: { variant?: "row" | "icon" }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem("theme", next);
  }

  const icon = <Icon name={theme === "dark" ? "moon" : "sun"} />;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-pressed={theme === "dark"}
        aria-label={theme === "dark" ? "Tema escuro ativo. Mudar para claro" : "Tema claro ativo. Mudar para escuro"}
        className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="focus-ring flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      aria-pressed={theme === "dark"}
    >
      <span>{theme === "dark" ? "Tema escuro" : "Tema claro"}</span>
      {icon}
    </button>
  );
}
