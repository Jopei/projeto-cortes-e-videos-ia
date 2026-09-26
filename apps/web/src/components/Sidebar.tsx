"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups } from "@/lib/nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusIndicator } from "@/components/StatusIndicator";

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();

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

      <div className="flex flex-1 flex-col gap-6">
        {navGroups.map((group) => {
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
        <StatusIndicator />
        <ThemeToggle />
      </div>
    </nav>
  );
}
