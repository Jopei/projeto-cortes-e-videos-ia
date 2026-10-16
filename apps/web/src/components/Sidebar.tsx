"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, navGroups, type NavBadgeKey } from "@/lib/nav";
import { StatusIndicator } from "@/components/StatusIndicator";
import { ChannelPicker } from "@/components/channels/ChannelPicker";
import { UserMenu } from "@/components/UserMenu";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/user-context";
import { useNavCounts } from "@/lib/nav-counts";
import { useAdminView } from "@/lib/admin-view";
import { displayNameOf } from "@/lib/admin-users";

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { summary } = useNavCounts();
  const { asUser, asUserId } = useAdminView();

  const attention = summary?.attention;
  // Badge: [count, tone, accessible description]. Hidden when the API predates `attention`.
  const badges: Partial<Record<NavBadgeKey, { count: number; tone: "primary" | "warning"; label: string }>> =
    attention
      ? {
          review: {
            count: attention.clips_pending_review,
            tone: "primary",
            label: "cortes aguardando revisão",
          },
          publications: {
            count: attention.publications_failed,
            tone: "warning",
            label: "publicações com falha",
          },
          series: {
            count: attention.episodes_needs_attention + attention.series_paused,
            tone: "warning",
            label: "itens de séries precisam de ação",
          },
        }
      : {};

  const visibleGroups = navGroups.filter((group) => !group.adminOnly || user?.is_admin);

  return (
    <nav aria-label="Navegação principal" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-center gap-2.5 px-1 pt-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
          <Icon name="scissors" size={16} />
        </span>
        <span className="text-base font-semibold text-fg">Projetos Cortes</span>
        <StatusIndicator />
      </div>

      <div className="flex flex-col gap-2">
        <ChannelPicker />
        {user?.is_admin && asUserId ? (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-warning/40 bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
            <Icon name="eye" size={12} /> Vendo como {asUser ? displayNameOf(asUser) : "…"}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {visibleGroups.map((group) => (
          <div key={group.id}>
            {group.label ? <p className="mb-1 px-3 text-xs font-medium text-fg-subtle">{group.label}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const badge = item.badge ? badges[item.badge] : undefined;
                const showBadge = badge && badge.count > 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`focus-ring relative flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:min-h-[36px] md:py-1.5 ${
                        active
                          ? "bg-primary-soft text-primary-text before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-primary"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                      }`}
                    >
                      <Icon name={item.icon} />
                      <span className="truncate">{item.label}</span>
                      {showBadge ? (
                        <span
                          className={`ml-auto min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${
                            badge.tone === "primary"
                              ? "bg-primary text-white"
                              : "border border-warning/40 bg-warning-soft text-warning"
                          }`}
                        >
                          {badge.count > 99 ? "99+" : badge.count}
                          <span className="sr-only"> {badge.label}</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <UserMenu onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
