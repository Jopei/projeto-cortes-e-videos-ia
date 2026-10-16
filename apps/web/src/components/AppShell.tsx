"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { displayNameOf } from "@/lib/admin-users";
import { useAdminView } from "@/lib/admin-view";
import { useAuth } from "@/lib/user-context";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { titleForPath } from "@/lib/nav";
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { asUser, asUserId, setAsUserId } = useAdminView();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // The login screen lives outside the app chrome: no sidebar, no nav.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        Pular para o conteúdo principal
      </a>

      {user?.is_admin && asUserId ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-center gap-2 border-b border-warning/40 bg-warning-soft px-4 py-2 text-center text-sm text-fg"
        >
          <span>
            Vendo como <span className="font-semibold">{asUser ? displayNameOf(asUser) : asUserId}</span>.
          </span>
          <button
            type="button"
            onClick={() => setAsUserId(null)}
            className="focus-ring rounded font-semibold text-warning underline underline-offset-2 hover:no-underline"
          >
            Voltar para todos
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col md:flex-row">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-2 shadow-card dark:shadow-none md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={isDrawerOpen}
            aria-controls="sidebar-drawer"
            className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
          >
            <span className="sr-only">{isDrawerOpen ? "Fechar menu" : "Abrir menu"}</span>
            <Icon name={isDrawerOpen ? "x" : "menu"} size={22} />
          </button>
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{titleForPath(pathname)}</span>
          <ThemeToggle variant="icon" />
          <Link
            href="/cortes/upload"
            aria-label="Enviar vídeo"
            className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-hover"
          >
            <Icon name="upload" />
          </Link>
        </header>

        {isDrawerOpen ? (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
          />
        ) : null}

        <aside
          id="sidebar-drawer"
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transform border-r border-border bg-surface shadow-pop transition-transform duration-200 ease-in-out motion-reduce:transition-none md:static md:shadow-none md:z-auto md:w-64 md:translate-x-0 ${
            isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </aside>

        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="min-w-0 flex-1 focus:outline-none"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
