"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // The login screen lives outside the app chrome: no sidebar, no nav.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Pular para o conteúdo principal
      </a>

      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950 md:hidden">
        <span className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Projetos Cortes
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen((open) => !open)}
          aria-expanded={isDrawerOpen}
          aria-controls="sidebar-drawer"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-200"
        >
          <span className="sr-only">
            {isDrawerOpen ? "Fechar menu" : "Abrir menu"}
          </span>
          <span aria-hidden="true">{isDrawerOpen ? "✕" : "☰"}</span>
        </button>
      </header>

      {isDrawerOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden"
        />
      ) : null}

      <aside
        id="sidebar-drawer"
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transform border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out dark:border-slate-700 dark:bg-slate-950 md:static md:z-auto md:w-64 md:translate-x-0 ${
          isDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </aside>

      <main
        id="conteudo-principal"
        tabIndex={-1}
        className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
