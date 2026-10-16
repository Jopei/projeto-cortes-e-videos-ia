import type { IconName } from "@/components/ui/Icon";

export type NavBadgeKey = "review" | "publications" | "series";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: NavBadgeKey;
};

export type NavGroup = {
  id: string;
  /** Rendered as a small section label; omit for the top, unlabelled group. */
  label?: string;
  items: NavItem[];
  /** Only rendered for `user.is_admin` (see components/Sidebar.tsx). */
  adminOnly?: boolean;
};

/** Ordered by workflow: produce -> series -> library/config -> admin. */
export const navGroups: NavGroup[] = [
  {
    id: "inicio",
    items: [{ href: "/cortes", label: "Visão geral", icon: "home" }],
  },
  {
    id: "produzir",
    label: "Produzir",
    items: [
      { href: "/cortes/upload", label: "Upload", icon: "upload" },
      { href: "/cortes/jobs", label: "Jobs", icon: "activity" },
      { href: "/cortes/revisao", label: "Revisão", icon: "review", badge: "review" },
      { href: "/cortes/publicacoes", label: "Publicações", icon: "send", badge: "publications" },
      { href: "/cortes/agenda", label: "Agenda", icon: "calendar" },
    ],
  },
  {
    id: "series",
    label: "Séries IA",
    items: [{ href: "/series", label: "Minhas séries", icon: "film", badge: "series" }],
  },
  {
    id: "biblioteca",
    label: "Biblioteca & configuração",
    items: [
      { href: "/cortes/canais", label: "Canais", icon: "layers" },
      { href: "/cortes/fontes-licencas", label: "Fontes & Licenças", icon: "shield" },
      { href: "/cortes/contas", label: "Contas", icon: "plug" },
      { href: "/cortes/auditoria", label: "Auditoria", icon: "history" },
      { href: "/encurtadores", label: "Encurtadores", icon: "link" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    adminOnly: true,
    items: [{ href: "/admin/usuarios", label: "Usuários", icon: "users" }],
  },
];

/** Title of the current route, for the mobile header. Longest-prefix match. */
export function titleForPath(pathname: string): string {
  const all = navGroups.flatMap((g) => g.items);
  const extra: NavItem[] = [
    { href: "/series/nova", label: "Nova série", icon: "film" },
    { href: "/conta", label: "Minha conta", icon: "user" },
  ];
  const match = [...all, ...extra]
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Projetos Cortes";
}

/** Active state: exact match, except nested routes (series detail/new) keep their parent lit. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/cortes") return pathname === "/cortes";
  return pathname === href || pathname.startsWith(href + "/");
}
