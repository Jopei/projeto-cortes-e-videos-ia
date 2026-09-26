export type NavItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  id: string;
  label: string;
  href: string;
  items?: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "cortes",
    label: "Cortes",
    href: "/cortes/upload",
    items: [
      { href: "/cortes/upload", label: "Upload" },
      { href: "/cortes/fontes-licencas", label: "Fontes & Licenças" },
      { href: "/cortes/jobs", label: "Jobs" },
      { href: "/cortes/revisao", label: "Revisão" },
      { href: "/cortes/publicacoes", label: "Publicações" },
      { href: "/cortes/contas", label: "Contas" },
      { href: "/cortes/agenda", label: "Agenda" },
    ],
  },
  {
    id: "encurtadores",
    label: "Encurtadores",
    href: "/encurtadores",
  },
];
