"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { navGroups } from "@/lib/nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusIndicator } from "@/components/StatusIndicator";
import { ChannelPicker } from "@/components/channels/ChannelPicker";
import { AdminViewPicker } from "@/components/admin/AdminViewPicker";
import { logout } from "@/lib/auth";
import { useAuth } from "@/lib/user-context";
import { displayNameOf } from "@/lib/admin-users";
import { StorageMiniIndicator } from "@/components/account/StorageMiniIndicator";

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // best-effort: still send the user to the login screen
    } finally {
      router.replace("/login");
    }
  }

  const visibleGroups = navGroups.filter((group) => !group.adminOnly || user?.is_admin);

  return (
    <nav
      aria-label="Navegação principal"
      className="flex h-full flex-col gap-6 overflow-y-auto p-4"
    >
      <div className="px-1">
        <span className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Projetos Cortes
        </span>
      </div>

      <ChannelPicker />

      {user?.is_admin ? <AdminViewPicker /> : null}

      <div className="flex flex-1 flex-col gap-6">
        {visibleGroups.map((group) => {
          const isSingleLink = !group.items || group.items.length === 0;

          return (
            <div key={group.id}>
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {group.label}
              </p>

              {isSingleLink ? (
                <Link
                  href={group.href}
                  onClick={onNavigate}
                  aria-current={pathname === group.href ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    pathname === group.href
                      ? "bg-indigo-600 text-white"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {group.label}
                </Link>
              ) : (
                <ul className="flex flex-col gap-1">
                  {group.items!.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                            active
                              ? "bg-indigo-600 text-white"
                              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        {!user?.is_admin ? <StorageMiniIndicator /> : null}
        {user ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <Link
              href="/conta"
              onClick={onNavigate}
              className="truncate font-medium text-slate-700 hover:underline dark:text-slate-200"
              title={displayNameOf(user)}
            >
              {displayNameOf(user)}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="shrink-0 font-medium text-indigo-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-indigo-400"
            >
              {loggingOut ? "Saindo…" : "Sair"}
            </button>
          </div>
        ) : null}
        <StatusIndicator />
        <ThemeToggle />
      </div>
    </nav>
  );
}
