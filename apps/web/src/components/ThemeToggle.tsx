"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
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

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      aria-pressed={theme === "dark"}
    >
      <span>{theme === "dark" ? "Tema escuro" : "Tema claro"}</span>
      <span aria-hidden="true">{theme === "dark" ? "🌙" : "☀️"}</span>
    </button>
  );
}
