"use client";

import { displayNameOf } from "@/lib/admin-users";
import { useAdminView } from "@/lib/admin-view";

/** Admin-only "ver como" selector — rendered inside the user menu (see
 * components/UserMenu.tsx); lib/admin-view.tsx owns the state. */
export function AdminViewPicker() {
  const { users, asUserId, setAsUserId, loadingUsers } = useAdminView();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="admin-view-picker" className="text-xs font-medium text-fg-subtle">
        Ver como
      </label>
      <select
        id="admin-view-picker"
        value={asUserId ?? ""}
        onChange={(e) => setAsUserId(e.target.value || null)}
        disabled={loadingUsers}
        className={`field-control w-full text-sm ${asUserId ? "border-warning/60 bg-warning-soft" : ""}`}
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
