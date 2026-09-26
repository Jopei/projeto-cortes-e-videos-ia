"use client";

import { displayNameOf } from "@/lib/admin-users";
import { useAdminView } from "@/lib/admin-view";

/** Admin-only "ver como" selector — see components/Sidebar.tsx (only
 * rendered for `user.is_admin`) and lib/admin-view.tsx for the state. */
export function AdminViewPicker() {
  const { users, asUserId, setAsUserId, loadingUsers } = useAdminView();

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="admin-view-picker"
        className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
      >
        Ver como
      </label>
      <select
        id="admin-view-picker"
        value={asUserId ?? ""}
        onChange={(e) => setAsUserId(e.target.value || null)}
        disabled={loadingUsers}
        className="w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <option value="">Todos os usuários</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {displayNameOf(u)}
          </option>
        ))}
      </select>
    </div>
  );
}
