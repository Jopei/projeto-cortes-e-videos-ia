"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminViewPicker } from "@/components/admin/AdminViewPicker";
import { StorageMiniIndicator } from "@/components/account/StorageMiniIndicator";
import { displayNameOf } from "@/lib/admin-users";
import { logout } from "@/lib/auth";
import { useAuth } from "@/lib/user-context";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Sidebar footer: avatar + name, opening a menu with account, "ver como" (admin), theme, storage and logout. */
export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
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

  if (!user) return null;
  const name = displayNameOf(user);

  return (
    <Popover
      label="Menu do usuário"
      placement="top-start"
      minWidth={256}
      renderTrigger={(props) => (
        <button
          type="button"
          {...props}
          title={name}
          className="focus-ring flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 md:group-data-[collapsed=true]/sb:justify-center"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
          >
            {initialsOf(name)}
          </span>
          <span className="min-w-0 flex-1 md:group-data-[collapsed=true]/sb:sr-only">
            <span className="block truncate text-sm font-medium text-fg">{name}</span>
            <span className="block text-xs text-fg-muted">{user.is_admin ? "Administrador" : "Minha conta"}</span>
          </span>
          <Icon name="chevronDown" className="-rotate-90 md:group-data-[collapsed=true]/sb:hidden" size={16} />
        </button>
      )}
    >
      {(close) => (
        <>
          <Link
            href="/conta"
            role="menuitem"
            onClick={() => {
              close();
              onNavigate?.();
            }}
            className="focus-ring flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <Icon name="user" /> Minha conta
          </Link>
          {user.is_admin ? (
            <div className="px-1 py-1">
              <AdminViewPicker />
            </div>
          ) : (
            <StorageMiniIndicator />
          )}
          <ThemeToggle />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="focus-ring flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="logout" /> {loggingOut ? "Saindo…" : "Sair"}
          </button>
        </>
      )}
    </Popover>
  );
}
