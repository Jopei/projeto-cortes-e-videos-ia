export type NavItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  id: string;
  label: string;
  href: string;
  items?: NavItem[];
  /** Only rendered for `user.is_admin` (see components/Sidebar.tsx). */
  adminOnly?: boolean;
};

export const navGroups: NavGroup[] = [
  {
    id: "cortes",
    label: "Cortes",
    href: "/cortes",
    items: [
      { href: "/cortes", label: "Visão geral" },
      { href: "/cortes/canais", label: "Canais" },
      { href: "/cortes/upload", label: "Upload" },
      { href: "/cortes/fontes-licencas", label: "Fontes & Licenças" },
      { href: "/cortes/jobs", label: "Jobs" },
      { href: "/cortes/revisao", label: "Revisão" },
      { href: "/cortes/publicacoes", label: "Publicações" },
      { href: "/cortes/contas", label: "Contas" },
      { href: "/cortes/agenda", label: "Agenda" },
      { href: "/cortes/auditoria", label: "Auditoria" },
    ],
  },
  {
    id: "series",
    label: "Séries IA",
    href: "/series",
    items: [
      { href: "/series", label: "Minhas séries" },
      { href: "/series/nova", label: "Nova série" },
    ],
  },
  {
    id: "encurtadores",
    label: "Encurtadores",
    href: "/encurtadores",
  },
  {
    id: "administracao",
    label: "Administração",
    href: "/admin/usuarios",
    adminOnly: true,
    items: [{ href: "/admin/usuarios", label: "Usuários" }],
  },
];
