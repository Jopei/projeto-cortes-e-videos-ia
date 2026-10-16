"use client";

import { useAuth } from "@/lib/user-context";
import { SkeletonList } from "@/components/ui/Skeleton";

/** Client-side gate for admin-only pages (e.g. `/admin/usuarios`). The nav
 * link is already hidden for non-admins (see lib/nav.ts/Sidebar), but a
 * direct URL visit must still be blocked — the backend already 403s every
 * `/api/admin/*` call for a non-admin, this just avoids rendering an empty
 * admin shell around that failure and shows a clear message instead. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <SkeletonList rows={4} />;

  if (!user?.is_admin) {
    return (
      <div
        role="alert"
        className="border-danger/40 bg-danger-soft text-fg rounded-lg border p-6 text-sm"
      >
        <p className="font-semibold">Acesso restrito (403)</p>
        <p className="mt-1">Esta área é exclusiva para administradores.</p>
      </div>
    );
  }

  return <>{children}</>;
}
