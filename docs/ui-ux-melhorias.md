# Painel: auditoria de UI/UX e plano de melhorias

Para o frontend-specialist. Auditoria feita em navegador real (Playwright/Chromium) em 15/10/2026, desktop 1440 px e mobile 390 px, tema claro e escuro, com 1 canal, 2 fontes e 1 série de exemplo (dados e usuário temporário já removidos). Screenshots (80 arquivos, `{d|m}-{light|dark}-{tela}.png`): `/tmp/claude-1000/-home-joaom-projetos-projetos-cortes/e6821d37-87a4-4de8-a084-b0ccd452ef39/scratchpad/shots/`.

Base atual: Tailwind 3.4, `slate` + `indigo`, `dark:` por classe, sem tokens (só `--background/--foreground` não usados), sem `Button`/`Card`/`PageHeader`/`Table`. Existem `Badge`, `Dialog`, `EmptyState`, `Skeleton`, `Toast`, `UsageBar`. Princípio deste plano: **extrair o que já se repete em componentes e aplicar tokens**, sem redesenhar o app. Mantém o dono (valoriza destaque visual claro): mais sombra, contraste e hierarquia.

---

## 1. Diagnóstico (problema, onde, evidência)

### 1.1 Layout e consistência
1. **A borda esquerda do conteúdo muda a cada página.** `h1` em x = 288 (Canais, Revisão, Agenda, Usuários), 305 (série), 336 (Visão geral, Contas, Fontes), 400 (Séries, Nova série, Jobs, Upload). Causa: cada página escolhe `max-w-3xl/4xl/5xl/6xl` + `mx-auto` (contagem no código: 4xl x4, 5xl x4, 6xl x2, e as demais sem limite). Ao navegar o título "pula" até 112 px. É o defeito mais visível do painel.
2. **Sem componentes de base**: 17 botões primários copiados à mão (`bg-indigo-600 px-4 py-2`), mais variações `px-3 py-1.5`; verde/vermelho de "Aprovar/Rejeitar selecionados" em outro padrão; links de ação ("Editar", "Excluir") em texto solto. Raios: 162x `rounded-md`, 39x `rounded-lg`, 40x `rounded-full`, sem regra.
3. **Cabeçalho de página improvisado**: h1 + parágrafo e, em Visão geral, **dois parágrafos** (descrição e "Mostrando dados de todos os canais…") empilhados antes do conteúdo. Ações primárias ("+ Nova fonte", "+ Novo canal") ficam abaixo do texto e à esquerda, em posição diferente por tela.
4. **Superfícies pouco diferenciadas**: claro = card branco com borda `slate-200` sem sombra sobre `slate-50` (quase invisível). Escuro = o card (`slate-950`) é **mais escuro que o fundo** (`slate-900`), parecendo um buraco em vez de elevação (ver `d-dark-serie.png`, `d-dark-usuarios.png`). Só modais têm sombra (`shadow-2xl`); cards têm 1x `shadow-sm` em todo o app.

### 1.2 Hierarquia e densidade
5. **Visão geral é um "painel de zeros"**: 4 KPIs 0 + 4 cartões "Nenhum registro ainda" + atalhos + um empty state tracejado; sem ordem de prioridade, sem o que fazer agora. Para quem opera todo dia, o que importa (quantos cortes esperam revisão, o que falhou, o que publica hoje) não é o maior elemento. Atalhos são botões cinza de mesmo peso.
6. **Texto pequeno demais em excesso**: 190 usos de `text-xs`; a tela Contas tem 36 elementos de texto <=12 px (9 com 11/10 px), a aba Episódios da série 94 de 167. Tabela de Usuários tem 9 colunas com cabeçalho em caixa-alta tracking-wide de 3 linhas ("SÉRIES IA ATIVAS", "CORTES / PUBLICAÇÕES").
7. **Rótulos de seção em caixa-alta tracking-wider** em toda a sidebar e em tabelas: leitura cansativa e peso igual ao conteúdo.
8. **Fonte**: nenhuma `next/font`; cai em system-ui (em Linux/Windows varia muito; no meu ambiente renderizou DejaVu Sans, largo e sem personalidade). Números sem `tabular-nums` em KPIs, custos, tabelas.

### 1.3 Navegação (sidebar)
9. **Sidebar com ~35 elementos verticais antes do rodapé**: 2 seletores (Canal, "Ver como", este último em âmbar permanente mesmo em "Todos"), 10 itens de Cortes, 2 de Séries, 1 de Encurtadores, 1 de Admin, rodapé com 4 blocos (usuário/Sair, API online, tema, cota). Em 900 px de altura a página cheia cabe, em 768 ou notebook com barra do navegador já rola. Sem ícones, sem agrupamento por fluxo, sem busca/atalho, sem badge de pendências (Revisão e Publicações não mostram contagem).
10. Ordem dos itens de Cortes não segue o fluxo real (Upload > Fontes > Jobs > Revisão > Publicações > Agenda); Canais, Contas e Auditoria (configuração) estão misturados com os de uso diário.
11. Item ativo = bloco indigo cheio (`bg-indigo-600`), correto e visível, mas **o mesmo peso** de um botão primário; não há distinção entre "estou aqui" e "faça isto".
12. "Encurtadores" é um grupo com rótulo + 1 item (rótulo e item repetem o mesmo texto); "Nova série" é item de menu mas é uma ação.
13. **Mobile**: o menu é um hambúrguer "☰" num cabeçalho que só tem o nome do app: sem título da página, sem acesso rápido; o drawer abre a mesma sidebar de 35 linhas.

### 1.4 Tabelas, listas e formulários
14. **Tabela de Fontes quebra no mobile**: scroll horizontal da página inteira (único `HSCROLL` detectado: `m-*-fontes`), colunas com texto quebrado palavra a palavra ("Série / IA: / Cidade / dos / Ecos"). Ver `m-light-fontes.png`.
15. **Lista de episódios no mobile** (`m-dark-serie-eps.png`): 20 cartões de 2 colunas, ~4 900 px de altura, cada um com miniatura vazia cinza grande, 2 chips e texto; para "o que preciso aprovar" o usuário rola tudo. Há filtro "Precisam de ação", mas não é o padrão.
16. **Canais**: card com 6 chips de plataforma `YouTube: 0 … Vimeo: 0` quase invisíveis (contraste 2,45:1 no claro, 2,36:1 no escuro) e rótulos "AGUARD. REVISÃO/AGENDADOS/PUBLICADOS" em grade 2+1 desalinhada. A informação útil (zero contas) fica escondida; o card ocupa 362 px de uma tela de 1440.
17. **Contas**: 9 cartões de plataforma, cada um com 2-3 links de texto soltos ("Conectar", "Adicionar conta manual", "Configurar chaves") no mesmo peso; ícone "ⓘ" renderiza como glifo quebrado (caixa) quando a fonte do sistema não tem o caractere; chip "OAuth não configurado" em duas linhas dentro de cartão estreito. Nenhuma ação é "a primária" do cartão.
18. **Selects nativos** em filtros e formulários (Status, Gênero, Canal) sem estilo próprio: aparência do SO destoa do resto (ver `d-light-series.png`). Aceitável por acessibilidade, mas precisa de estilo base (altura, raio, seta).
19. Wizard (Nova série): stepper pequeno (12 px, círculo de 24 px) sem linha de progresso; barra de ações "Voltar/Continuar" **cai solta** com fundo próprio branco e uma borda que ultrapassa o cartão em 4 px de cada lado (ver `d-light-nova.png`, y ~ 772-835); "Voltar" desabilitado no passo 1 ocupa espaço.

### 1.5 Estados e feedback
20. **Estados vazios são só texto + (às vezes) botão**, em caixa tracejada cinza, sem ícone e sem ação coerente (Revisão: "Cortes aparecem aqui depois que um job termina…" sem botão "Ir para Upload"; Agenda: idem). Visão geral mostra **cinco** vazios na mesma página.
21. **Desabilitado = só opacidade**: em Revisão, "Aprovar/Rejeitar/Publicar selecionados" aparecem lavados, e o texto branco sobre o verde sofre: 3,77:1 (falha AA) para "Aprovar selecionados". O estado "0 selecionados" já deveria esconder/esmaecer o conjunto inteiro como barra de ação contextual.
22. **Feedback de ação**: existe `Toast`, mas o uso de `window.confirm/alert` aparece em 3 componentes (`SourcesManager`, `SeriesActionDialogs`, `ScriptParts`); confirmações destrutivas ("Excluir" em texto vermelho solto, na linha da tabela) precisam do mesmo Dialog. Só 4 `transition-colors`/9 transições em todo o app: botões e cards sem microinteração (pressed, hover elevado), sem skeleton consistente.
23. Banners (aviso de licença em Fontes, âmbar "Ver como", azul "Plano pronto") têm três estilos diferentes.

### 1.6 Acessibilidade (WCAG AA)
24. Contraste medido por varredura de texto (claro/escuro, 12 telas): falhas em `text-slate-400` sobre claro (2,45:1: chips de Canais, textos de Upload), `slate-600/500` sobre escuro em rótulos de Canais (2,36:1 e 4,24:1, 3,75:1), botão verde com texto branco (3,77:1). São poucos pontos, mas todos "texto secundário", justo o que o dono não consegue ler. Padrão a banir: `text-slate-400` em fundo claro e `text-slate-500` em fundo escuro `slate-900`.
25. **Alvos de toque**: 32 elementos interativos <32 px de altura só em Contas, 9 em Usuários, 5 a 7 em Visão geral/Fontes (WCAG 2.5.8 pede 24 px; boa prática mobile 40-44). Links de texto em linha ("Editar Excluir") com ~16 px de altura e 12 px de espaço entre si: toque errado em "Excluir" é fácil.
26. Pontos bons a preservar: `skip link`, `aria-current` na sidebar, `focus-visible` indigo, `prefers-color-scheme` + ThemeScript sem flash, `aria-expanded` no drawer, `role="status"` nos banners.
27. Tema escuro: o tom é bom (slate-900), mas o seletor de tema usa símbolo "☀/☾" por Unicode: em "Tema escuro" aparece um retângulo (glifo ausente), ver `d-dark-visao.png`. Trocar por SVG inline.

---

## 2. Plano priorizado

Esforço: P = pequeno (<1 h), M = médio (meio dia). Ordem = impacto/esforço.

### Rodada 1 (salto visível, quase tudo mecânico)

| # | Item | Esforço | Ganho |
|---|---|---|---|
| P0-1 | Contêiner único de página (borda esquerda constante) | P | Mata o "pulo" entre telas |
| P0-2 | Tokens + superfícies com elevação (claro/escuro) | P | Cards destacados, mais profundidade |
| P0-3 | `Button` (5 variantes) + migrar os 17+ botões | M | Consistência, estados, alvo 40 px |
| P0-4 | `PageHeader` (título, descrição, ações à direita) | P | Hierarquia e ações sempre no mesmo lugar |
| P0-5 | Corrigir contraste (lista de classes proibidas) | P | AA |
| P0-6 | Sidebar: agrupar, ícones, badges, rodapé compacto | M | Reduz 35 linhas para ~22 + contagens |
| P0-7 | Fonte Inter + `tabular-nums` | P | Cara de produto |
| P1-1 | `Card`, `Badge` único, `EmptyState` com ícone+ação | M | Estados vazios úteis |
| P1-2 | Visão geral como "central de trabalho" | M | O que fazer agora |

### Rodada 2
P1-3 `DataTable` responsiva (cards no mobile) | P1-4 barra de ação contextual (Revisão/Episódios) | P1-5 Tabs e Stepper | P1-6 Toast para toda ação + ConfirmDialog (remover `confirm/alert`) | P2 busca/atalhos (`Ctrl+K`), sidebar colapsável, cabeçalho mobile com título + bottom nav.

---

## 3. Especificação

### 3.1 Design tokens (P0-2)

Definir em `globals.css` como CSS variables (valores RGB sem alfa para permitir `/opacity`) e expor no `tailwind.config.ts` em `theme.extend.colors`. Em seguida substituir gradualmente `bg-white dark:bg-slate-950` etc. por tokens (comece por AppShell, Sidebar, Dialog, Card, Button, Table; o resto troca por busca e substituição).

```css
:root {
  --bg:        248 250 252; /* slate-50  página */
  --surface:   255 255 255; /* cards, sidebar */
  --surface-2: 241 245 249; /* slate-100 cabeçalho de tabela, hover, inputs desabilitados */
  --border:    226 232 240; /* slate-200 */
  --border-strong: 203 213 225; /* slate-300 inputs, botão outline */
  --fg:        15 23 42;    /* slate-900 */
  --fg-muted:  71 85 105;   /* slate-600 (7,6:1 no branco) */
  --fg-subtle: 100 116 139; /* slate-500: só texto >=14 px sobre --surface/--bg (4,6:1) */
  --primary:   79 70 229;   /* indigo-600 */
  --primary-hover: 67 56 202; /* indigo-700 */
  --primary-soft: 238 242 255; /* indigo-50 */
  --ring:      99 102 241;  /* indigo-500 */
  --success: 5 150 105;  --success-soft: 236 253 245;  /* emerald-600 / 50 */
  --warning: 180 83 9;   --warning-soft: 255 251 235;  /* amber-700 / 50 (texto 5,0:1) */
  --danger:  220 38 38;  --danger-soft:  254 242 242;  /* red-600 / 50 */
  --info:    2 132 199;  --info-soft:    240 249 255;  /* sky-600 / 50 */
}
.dark {
  --bg:        2 6 23;      /* slate-950 página: mais escuro */
  --surface:   15 23 42;    /* slate-900 cards: MAIS CLARO que o fundo = elevação */
  --surface-2: 30 41 59;    /* slate-800 */
  --border:    51 65 85;    /* slate-700 */
  --border-strong: 71 85 105; /* slate-600 */
  --fg:        241 245 249; /* slate-100 */
  --fg-muted:  203 213 225; /* slate-300 */
  --fg-subtle: 148 163 184; /* slate-400 (6,9:1 em slate-900) */
  --primary:   99 102 241;  /* indigo-500 botão (texto branco 4,5:1 ok com font-semibold 14px+) */
  --primary-hover: 129 140 248;
  --primary-soft: 49 46 129 / 0.4; /* usar rgb(var(--primary) / .15) */
  --ring:      129 140 248; /* indigo-400 */
  --success: 52 211 153; --success-soft: 6 78 59;   /* emerald-400 / 900 usar com /40 */
  --warning: 251 191 36; --warning-soft: 120 53 15;
  --danger:  248 113 113; --danger-soft: 127 29 29;
  --info:    56 189 248; --info-soft: 12 74 110;
}
```

Tailwind: `colors: { bg: "rgb(var(--bg) / <alpha-value>)", surface: ..., "surface-2", border: ..., "border-strong", fg, "fg-muted", "fg-subtle", primary: { DEFAULT, hover, soft }, success, warning, danger, info (+ "-soft") }`. Body: `bg-bg text-fg`.

Inversão importante no escuro: **página `slate-950`, card/sidebar `slate-900`** (hoje é o contrário).

- **Raio**: `--radius`: controles (botão, input, chip de menu) `rounded-lg` (8 px); cards `rounded-xl` (12 px); modal `rounded-2xl` (16 px); badges `rounded-full`. Abolir `rounded-md` em componentes novos.
- **Sombras** (`boxShadow` no config): `card: "0 1px 2px rgb(15 23 42 / .06), 0 1px 3px rgb(15 23 42 / .08)"`; `card-hover: "0 4px 12px rgb(15 23 42 / .10)"`; `pop` (menus, toast): `"0 8px 24px rgb(15 23 42 / .16)"`; modal mantém `shadow-2xl` + `bg-black/70 backdrop-blur-sm` (já aprovado pelo dono). No escuro sombra é invisível: card usa `dark:border-border` + `dark:shadow-none` e `ring-1 ring-white/5`.
- **Espaçamento**: escala de 4 px; padding de card `p-5` (`p-4` no mobile), gap entre cards `gap-4`, entre seções `space-y-6`, entre página e título `mb-6`.
- **Tipografia**: `next/font/google` Inter (`subsets: ["latin","latin-ext"]`, `display: "swap"`, variável `--font-sans`; `fontFamily.sans` no config). Escala: h1 `text-2xl font-semibold tracking-tight` (`sm:text-3xl` não), h2 de seção `text-base font-semibold`, corpo `text-sm` (14), auxiliar `text-sm text-fg-muted`, legenda `text-xs` (12) **só** para metadados não essenciais. Rótulos em caixa-alta apenas em cabeçalho de tabela (`text-xs font-medium uppercase tracking-wide text-fg-subtle`), nunca na sidebar. Números: `tabular-nums` em KPIs, custos, tabelas.
- **Foco**: `focus-visible:outline-2 outline-offset-2 outline-[rgb(var(--ring))]` em todo interativo (classe utilitária `.focus-ring` via `@layer components`).
- **Movimento**: `transition-colors duration-150`, hover de card `transition-shadow duration-200`; `motion-reduce:transition-none`. Sem animações novas além de skeleton `animate-pulse` e toast slide/fade de 150 ms.

### 3.2 Contêiner de página (P0-1)

Em `AppShell`, trocar `<main className="flex-1 px-4 py-6 ...">` por `<main ...><div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div></main>`, **centralizado, 1152 px**, e **remover todo `max-w-*xl mx-auto` das páginas** (title, lista, wizard). Exceções declaradas por prop do `PageHeader`/wrapper: formulário longo (`Nova série`, `Conta`, `Upload`) usa `max-w-3xl` *alinhado à esquerda* (sem `mx-auto`) dentro do mesmo contêiner, para a borda esquerda continuar fixa. Resultado: `h1` sempre no mesmo x.

### 3.3 Componentes (criar em `src/components/ui/`)

**Button** (`Button.tsx`, aceita `variant`, `size`, `loading`, `icon`, `asChild`/`href` -> Link)
- Base: `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px`
- `size`: `md` = `h-10 px-4 text-sm` (40 px, padrão); `sm` = `h-8 px-3 text-sm` (tabelas; ainda >=24 px); `lg` = `h-11 px-5 text-base` (login, CTA).
- `primary`: `bg-primary text-white shadow-sm hover:bg-primary-hover`.
- `secondary`: `bg-surface text-fg border border-border-strong shadow-sm hover:bg-surface-2`.
- `ghost`: `text-fg-muted hover:bg-surface-2 hover:text-fg` (ações em linha, ícones).
- `success` (Aprovar): `bg-success text-white` no claro usa `emerald-700` (`5 120 85`, 5,5:1) para passar AA; `danger` (Rejeitar/Excluir): `bg-danger text-white` (`red-700` no claro, 6,5:1); `danger-outline`: `border border-danger/40 text-danger hover:bg-danger-soft`.
- `loading`: spinner 16 px à esquerda, mantém largura (`aria-busy`, texto muda para gerúndio como já feito: "Saindo…").
- Desabilitado = opacidade 50% + `cursor-not-allowed`; nunca trocar para cor clara diferente.
- Migrar: todo `bg-indigo-600 ... px-4 py-2` -> `<Button>`; "Editar" em tabela -> `ghost sm`; "Excluir" -> `danger-outline sm` (ou item de menu "⋯", ver tabela).

**Card** (`Card.tsx`): `rounded-xl border border-border bg-surface shadow-card` + `p-5`; variantes `interactive` (`hover:shadow-card-hover hover:border-border-strong transition-shadow`, para cards clicáveis como canal/série), `Card.Header` (`flex items-start justify-between gap-3 mb-4`, título `text-base font-semibold`), `Card.Footer` (`mt-4 pt-4 border-t border-border flex gap-2`). Substitui os blocos "bg-white border rounded" copiados.

**PageHeader** (`PageHeader.tsx`): props `title`, `description`, `actions`, `breadcrumb?`, `meta?`.
```
<header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div class="min-w-0">
    <h1 class="text-2xl font-semibold tracking-tight text-fg">…</h1>
    <p class="mt-1 max-w-2xl text-sm text-fg-muted">…</p>   // 1 parágrafo só
  </div>
  <div class="flex shrink-0 flex-wrap gap-2">{actions}</div>
</header>
```
Ação primária da tela (Nova fonte, Novo canal, Nova série, Novo usuário) sempre aqui, à direita; no mobile desce abaixo do título, largura total (`w-full sm:w-auto`). A frase "Mostrando dados de todos os canais" vira um chip ao lado do título (`Badge neutral` com o nome do escopo) ou desaparece quando o filtro é o padrão.

**Badge** (consolidar `Badge.tsx` + `StatusBadges.tsx`): `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border`, variantes `neutral|info|success|warning|danger|primary` com `bg-{x}-soft text-{x} border-{x}/25` (tokens, passam AA nos dois temas), ponto opcional `●` 6 px à esquerda; contador numérico usa `tabular-nums`. Mantém o mapa de status de `docs/series-ia-ui.md`. Chips de plataforma de Canais ficam `neutral` quando 0, `success` quando >=1 (resolve o contraste e ainda informa).

**EmptyState** (evoluir o existente): `flex flex-col items-center text-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10`; ícone 40 px em círculo `bg-primary-soft text-primary` (SVG inline por tela: upload, filtro, calendário, clips), título `text-base font-semibold`, texto `text-sm text-fg-muted max-w-sm`, **ação obrigatória** (`primary` quando é onboarding, `secondary` quando é "limpar filtros"). Textos de partida: Revisão vazia -> "Nada para revisar agora" + botão "Enviar um vídeo" (`/cortes/upload`); Agenda vazia -> "Nenhuma publicação nesta semana" + "Ir para Revisão"; Canais -> "Crie seu primeiro canal". Usar `variant="inline"` (sem borda, `py-4`, uma linha) dentro de cards de dashboard para não repetir cinco caixas.

**Table / DataTable** (`Table.tsx`): `div overflow-x-auto rounded-xl border border-border bg-surface shadow-card`; `thead` `bg-surface-2 text-xs font-medium uppercase tracking-wide text-fg-subtle`, `th` `px-4 py-3 text-left`; `td` `px-4 py-3 text-sm`; linhas `border-t border-border hover:bg-surface-2/60`; cabeçalho `sticky top-0` quando a tabela passa de ~10 linhas. Colunas numéricas `text-right tabular-nums`. Ações: coluna final com `Button ghost sm` "Editar" + menu "⋯" (`aria-haspopup="menu"`) com "Excluir" em `danger`; confirmação por Dialog. **Mobile (`<md`)**: cada linha vira card (`md:table-row` / `block`), com o campo principal em destaque (título `font-medium`), os demais em pares `rótulo: valor` (`dl` com `grid-cols-2 gap-x-3 text-sm`), e ações ao final (largura total). Isso resolve Fontes e Usuários (9 colunas -> mostrar 4 no desktop: Usuário, Status, Uso, Ações; o resto num painel expansível ou no editar).

**Tabs** (`Tabs.tsx`, já existe algo em `SeriesDetailView`, extrair): `role="tablist"`, `border-b border-border`, aba `px-3 py-2.5 text-sm font-medium -mb-px border-b-2`; ativa `border-primary text-primary`; inativa `border-transparent text-fg-muted hover:text-fg hover:border-border-strong`; contador opcional em `Badge`; no mobile `overflow-x-auto` sem quebra, setas esquerda/direita mudam de aba. Aba de episódios mostra `Badge warning` com nº "precisam de ação".

**Form fields** (`Field.tsx`, `Input`, `Select`, `Textarea`): rótulo `text-sm font-medium text-fg` (hoje é normal), ajuda `mt-1 text-xs text-fg-muted`, erro `mt-1 text-sm text-danger` com ícone e `aria-describedby`; controle `h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-surface-2 aria-[invalid=true]:border-danger`. `Select` com `appearance-none` + seta SVG em `bg-[url]` ou wrapper; mesma altura do input. Obrigatório = asterisco `text-danger` + `aria-required`. Em mobile, `text-base` (16 px) para evitar zoom do iOS.

**Toast** (existente; ajustes): posição `bottom-4 right-4` (desktop) / `inset-x-4 bottom-4` (mobile), `rounded-xl bg-surface border border-border shadow-pop`, barra lateral de 4 px na cor do tipo, ícone, título curto, ação opcional ("Desfazer", "Ver"), 5 s (erro 8 s e fecha manual), `role="status"`/`alert` conforme tipo. **Regra**: toda mutação (aprovar, rejeitar, agendar, excluir, salvar) mostra toast; ações reversíveis (aprovar/rejeitar corte) com "Desfazer". Remover `window.confirm/alert` (3 componentes) -> `ConfirmDialog` (reutiliza `Dialog`, botão `danger`, foco inicial em "Cancelar").

**Banner/Callout** (`Callout.tsx`, unifica aviso de licença, "Ver como", "Plano pronto"): `flex gap-3 rounded-xl border p-4 text-sm` com `info|warning|danger|success` via tokens `bg-{x}-soft border-{x}/30`, ícone e título em `font-semibold`.

### 3.4 Sidebar (P0-6)

Desktop `md:w-64` (manter), `bg-surface border-r border-border`, padding `p-3`.

1. **Topo**: logo (quadrado 28 px `bg-primary rounded-lg` com ícone de tesoura/play + "Projetos Cortes" `text-base font-semibold`). Abaixo, **um único bloco de contexto** em vez de dois selects soltos: botão `rounded-lg border bg-surface-2 h-10` mostrando "● Canal Ação BR ▾" (abre popover com a lista); "Ver como" (admin) vira item secundário dentro do menu do usuário (rodapé) e, **quando ativo**, aparece o banner âmbar existente no topo da página + chip âmbar no bloco de contexto. Hoje o âmbar aparece o tempo todo, mesmo em "Todos os usuários", e consome 3 linhas.
2. **Agrupar por fluxo** (rótulos `text-xs font-medium text-fg-subtle px-3 mb-1`, **sem caixa-alta**; grupos colapsáveis com seta, estado em `localStorage`, abertos por padrão se contêm a rota ativa):
   - (sem rótulo) **Visão geral**
   - **Produzir**: Upload, Jobs, Revisão `(n)`, Publicações `(n)`, Agenda
   - **Séries IA**: Minhas séries `(n precisam de ação)`; "Nova série" sai do menu e vira botão primário no `PageHeader` de `/series`
   - **Biblioteca & configuração**: Canais, Fontes & Licenças, Contas, Auditoria, Encurtadores (move para cá; grupo de 1 item deixa de existir)
   - **Administração** (admin): Usuários (+ futuras integrações)
   Mantém URLs; só muda `lib/nav.ts` (adicionar `icon` e `badge?: "review"|"publications"|"series"` por item).
3. **Item**: `flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium`; ícone 18 px `stroke 1.75` (SVG inline: casa, upload, fila, check-quadrado, send, calendário, filme/sparkles, canais, escudo/licença, plug, histórico, link, usuários). Inativo `text-fg-muted hover:bg-surface-2 hover:text-fg`; **ativo** `bg-primary-soft text-primary` + barra de 3 px à esquerda (`before:absolute before:left-0 before:h-5 before:w-[3px] before:rounded-r before:bg-primary`) — deixa o preenchimento cheio indigo só para botões primários, e preserva `aria-current="page"`. Badge de contagem à direita: `ml-auto rounded-full bg-primary text-white text-xs px-1.5 min-w-[1.25rem] text-center tabular-nums` (Revisão), `bg-warning-soft text-warning` para "precisam de ação". Fonte dos números: `GET /api/dashboard/summary` (já existe, com `channel_id`) com polling de 30-60 s (`use-polling.ts`); para séries, contar episódios `awaiting_script_approval|pending_review` (confirmar se há campo agregado ou usar `GET /series`).
4. **Rodapé** (de 4 blocos para 1 linha): avatar com iniciais (32 px) + nome + "⋯" que abre menu `Minha conta`, `Ver como…` (admin), `Tema: Claro/Escuro/Sistema` (segmentado), `Sair`; a cota de armazenamento vira barra fina `h-1.5` dentro do menu e no item "Minha conta" (aparece com destaque só se >80%); "API online" vira ponto verde 8 px ao lado do logo (vermelho + tooltip quando offline). Tema continua com toggle **ícone SVG** (sol/lua) no cabeçalho mobile e no menu, resolvendo o glifo quebrado.
5. **Atalhos e busca (rodada 2)**: `Ctrl/⌘+K` abre uma paleta (Dialog) com todas as rotas + ações ("Nova série", "Enviar vídeo"), filtro por digitação, `↑↓` e `Enter`; botão de busca no topo da sidebar mostrando `Ctrl K`. Atalhos `g r` (Revisão), `g u` (Upload) opcionais; Revisão já tem J/K/A/R, exibir no rodapé da tela como hoje.
6. **Colapso (rodada 2)**: botão de recolher para `w-16` só com ícones e tooltip (útil em telas de 1280 px com tabela larga); estado em `localStorage`.
7. **Mobile (`<md`)**: cabeçalho fixo `h-14` com ☰ (SVG, 44 px), título da página atual (`truncate`), e botão de ação rápida (Upload). Drawer igual ao desktop com `shadow-pop`, fecha ao navegar (já faz). Rodada 2: **bottom nav** de 4-5 itens (Início, Upload, Revisão `(n)`, Agenda, Mais) com `h-16`, `pb-[env(safe-area-inset-bottom)]`, para a tarefa diária de revisar/aprovar em uma mão.

### 3.5 Visão geral (P1-2) — "central de trabalho"

Ordem, de cima para baixo (grid `gap-4`; mobile em coluna):

1. `PageHeader` "Visão geral" (descrição curta de 1 linha), ações: `Enviar vídeo` (primary), `Revisar cortes` (secondary, com contagem).
2. **Faixa "Precisa da sua atenção"** (só aparece se houver itens; é o que domina a tela): `Callout`s ou cards horizontais com contagem grande e ação: "12 cortes aguardando revisão -> Revisar", "3 publicações falharam -> Ver", "2 episódios aguardam aprovação de roteiro -> Abrir", "Cota de armazenamento em 87%". Cada card `Card interactive` com número `text-3xl font-semibold tabular-nums` + rótulo + seta; cor de borda superior de 3 px pela urgência (`danger` falha, `warning` espera, `primary` info). Sem itens: um único `Callout success` "Tudo em dia".
3. **KPIs** (4, em `grid-cols-2 lg:grid-cols-4`): Cortes aguardando revisão, Jobs ativos, Agendados (7 dias), Publicados (7 dias), com mini variação opcional. Zero em `text-fg-subtle` (não `0` preto grosso), valor `text-2xl font-semibold`, clicável levando à tela filtrada. Remover "Uploads" (baixa utilidade diária).
4. Linha de 2 colunas (`lg:grid-cols-3`): **Próximos agendamentos** (2/3, lista de 5 com data/hora, plataforma, miniatura, canal) e **Jobs em andamento** (1/3, barra de progresso `h-1.5`). Gráficos "Cortes por status"/"Publicações por status": trocar por barra horizontal empilhada única (`h-2 rounded-full`, segmentos por token + legenda), escondida quando tudo zerado.
5. **Primeiro uso** (zero canais/fontes/vídeos): em vez de 5 vazios, um bloco "Comece por aqui" com checklist de 4 passos (1 Criar canal, 2 Cadastrar fonte/licença, 3 Enviar vídeo, 4 Conectar conta), com check automático, cada passo com botão. Substitui "Atalhos" e o empty tracejado atual.
6. Skeletons com o mesmo layout (3 blocos `h-24 animate-pulse rounded-xl bg-surface-2`) enquanto carrega; erro: `Callout danger` com "Tentar de novo".

### 3.6 Melhorias por tela

- **Login**: card `max-w-sm rounded-2xl shadow-pop` centralizado verticalmente com logo e uma frase de valor ("Cortes verticais, direitos em dia"); botão `lg` full width; "Mostrar" vira botão-ícone de olho com `aria-pressed`; mensagem de erro em `Callout danger` abaixo do campo (hoje 401/429 genéricos: diferenciar "Muitas tentativas, tente em X min" para 429); toggle de tema no canto superior direito, não solto abaixo do card. Autofocus fica.
- **Canais**: grade `sm:grid-cols-2 xl:grid-cols-3`; card com faixa de cor do canal (`border-t-4` na cor), nome, nicho; linha de "contas conectadas" como ícones de plataforma coloridos (ligado) vs. cinza (não ligado) com tooltip; 3 mini-métricas em linha `grid-cols-3` (Revisão, Agendados, Publicados); ações: `Editar` ghost, `Contas` secondary; "Excluir" no menu "⋯". Remove os 6 chips ilegíveis.
- **Upload**: se não há fonte, `Callout warning` com botão "Cadastrar fonte"; passos numerados (1 Escolha a fonte/licença, 2 Envie o arquivo, 3 Defina o preset) com o dropzone (`border-2 border-dashed rounded-xl h-40`, destaque `bg-primary-soft border-primary` no drag-over, ícone, "Arraste ou escolha", formatos em `text-sm` não 12 px); barra de progresso `h-2` com velocidade e tempo restante; erro de cota 413 com mensagem e link para "Minha conta".
- **Fontes & Licenças**: aviso de licenciamento vira `Callout warning` recolhível (expandido na 1ª visita, depois um resumo de 1 linha com "Ver regras"), pois ocupa 130 px fixos; tabela com badge de licença colorido por risco (`public_domain/CC-BY` success, `CC-BY-NC` warning, `CC-BY-ND` danger, "Gerado por IA" primary) e coluna **Validade** com `Badge warning` quando <30 dias; mobile em cards (3.3). Séries IA criam fonte automaticamente: marcar a linha e desabilitar "Excluir" com tooltip.
- **Jobs**: lista com barra de progresso, estágio em texto, tempo; agrupar "Em andamento" (topo, destacado) e "Concluídos"; falha com `Badge danger` + botão "Ver erro" (Dialog) e "Tentar de novo" (se a API permitir; senão sinalizar ao backend).
- **Revisão** (tela mais usada): barra de ação **sticky** (`sticky top-0 z-10 bg-bg/90 backdrop-blur border-b`) que só aparece com seleção: "N selecionados · Aprovar · Rejeitar · Publicar…" (botões `success`/`danger-outline`/`primary` com contraste AA); sem seleção mostra apenas filtros + chip de atalhos "J/K navegar · A aprovar · R rejeitar" **em destaque** (não em cinza claro) com botão "?" que abre a lista completa. Cards de clip: vídeo 9:16 `aspect-[9/16]` com `loading="lazy"` e `preload="none"` (performance), score como `Badge` com cor por faixa (>=80 success, 50-79 warning, <50 neutral), foco visível forte (`ring-2 ring-primary`) no card atual dos atalhos J/K, e após aprovar/rejeitar avançar automaticamente para o próximo + toast "Aprovado · Desfazer". Mobile: 1 coluna, botões Aprovar/Rejeitar fixos na base do card (`h-11`).
- **Publicações**: filtros em chips (status) com contagem; tabela -> cards no mobile; status com `Badge`; "Bloqueado" exibe o motivo do rights gate em texto claro (`block_reasons`) em `Callout danger` expansível, pois é a regra central do produto; ação "Cancelar"/"Takedown" com `ConfirmDialog`.
- **Contas**: cada cartão de plataforma com logo/ícone (SVG), status em `Badge` de **uma linha** ("Conectada", "Sem chaves", "Manual"), e **uma** ação principal (`Conectar` primary quando as chaves estão configuradas; `Configurar chaves` primary quando não; "Adicionar conta manual" como `ghost`); "Configurar chaves" para admin num ícone de engrenagem. Trocar o ícone "ⓘ" por SVG com tooltip acessível (`button` + `aria-describedby`). Lista de "Contas cadastradas" em tabela (plataforma, nome, canal, modo, limite diário, último uso) em vez de só empty state.
- **Agenda**: cabeçalho com intervalo da semana centralizado entre `‹ ›` (botões-ícone 40 px) + "Hoje"; hoje destacado (`bg-primary-soft` na coluna); itens de publicação como cartões coloridos pelo canal com hora e plataforma; mobile: lista por dia (agenda vertical) em vez de grade de 7 colunas; vazio com ação.
- **Auditoria**: filtros (ação, usuário, período) em linha; tabela densa `text-sm`, `details` em JSON expansível em `<pre>` com `font-mono text-xs bg-surface-2`; paginação/"Carregar mais".
- **Séries IA (lista)**: card `interactive` inteiro clicável; status e "precisa de ação" em destaque (`Badge warning` + borda superior âmbar); mini-timeline de 20 segmentos mantida, trocar o cinza `slate-200` (quase invisível) por `surface-2` com borda e segmentos aprovados `success`; botão "Nova série" no `PageHeader`.
- **Série (detalhe)**: cabeçalho em 2 linhas (título + status; metadados em `text-sm text-fg-muted`), ações em hierarquia: **uma** primária (Iniciar série), as demais em menu "Ações" (Replanejar, Cancelar, Excluir `danger`); hoje 4 botões do mesmo peso lado a lado e a mesma ação "Iniciar série" aparece **duas vezes** (cabeçalho e banner). Timeline de episódios sem corte horizontal: em `<lg` vira lista vertical. Painel "Configuração": valores técnicos (`fake_image`) em `font-mono`.
- **Série · Episódios**: padrão "Precisam de ação" ligado quando existir ≥1 (com contagem no filtro); mobile: lista compacta de 1 coluna (linha de 64 px: nº, título, `Badge`, custo) em vez de cartões com miniatura vazia de 150 px; miniatura só quando existir.
- **Nova série (wizard)**: stepper com linha de conexão (`flex-1 h-0.5 bg-border`, concluídos `bg-primary`, passo atual `ring-4 ring-primary/20`) e no mobile só "Passo 2 de 5 · Estilo e custo" + barra `h-1.5`; rodapé de ações **dentro** do card (`border-t pt-4`), "Voltar" `secondary` sempre visível (no passo 1 vira "Cancelar"); estimativa de custo em coluna lateral sticky (`lg:sticky lg:top-6`) visível em todos os passos, pois o princípio nº 1 da spec é "custo antes de gastar".
- **Usuários (admin)**: 9 colunas -> 5 (Usuário, Papel/Status juntos em 1 linha com 2 badges lado a lado, Uso com `UsageBar` mini para armazenamento, Cortes/Pub., Ações); `UsageBar` com limiar de cor (>=80% warning, >=100% danger).
- **Minha conta**: seções em `Card` (Perfil, Senha, Uso e cotas com `UsageBar`, Sessões com "Sair de todos os dispositivos" `danger-outline` + ConfirmDialog); medidor de força de senha já existe (`lib/password.ts`) -> mostrar como barra de 4 segmentos.
- **Encurtadores**: hoje `PlaceholderPage`; mostrar `EmptyState` "Em breve" claro e discreto ou ocultar do menu até existir.

### 3.7 Acessibilidade: regras que entram junto

- Texto secundário: **claro** `text-fg-muted` (slate-600) em corpo; `text-fg-subtle` (slate-500) só em >=14 px sobre `--surface/--bg`; proibido `text-slate-400` em fundo claro e `text-slate-500/600` em fundo `slate-900` escuro (usar `fg-subtle` dark = slate-400). Buscar e corrigir `text-slate-400` (19 ocorrências) e `slate-500` (108) ao migrar para tokens.
- Alvos interativos: `h-10` (40 px) por padrão, mínimo `h-8` só em tabelas densas e com `gap-2` entre alvos; no mobile todo botão/linha clicável `min-h-[44px]`.
- Status nunca só por cor (já na spec de Séries): estender a Publicações/Jobs/Contas (ícone ou texto).
- `prefers-reduced-motion`: `motion-reduce:` em spinners/transições; ✓ `aria-live="polite"` para toasts e contagens que mudam por polling.
- Ícones decorativos `aria-hidden`, botões-ícone com `aria-label`; remover glifos Unicode ("☰", "☀", "ⓘ", "✕") por SVG inline (evita caixa quebrada por falta de fonte).
- Dialog: manter `shadow-2xl`/`ring-1`/`bg-black/70` (feedback do dono); garantir `aria-modal`, foco inicial no primeiro controle ou "Cancelar" em destrutivos, fechar com Esc, retorno de foco ao gatilho.

### 3.8 Ordem de implementação sugerida

**Rodada 1 (1 dia de trabalho do frontend-specialist)**
1. Tokens + Inter + `tabular-nums` (`globals.css`, `tailwind.config.ts`, `layout.tsx`); trocar `body` e AppShell/Sidebar/Dialog para tokens (inverte o escuro).
2. Contêiner único `max-w-6xl` em `AppShell`; remover `max-w` e `mx-auto` das 12 páginas; `PageHeader` em todas.
3. `Button` e migração dos botões; `Card`; `Badge` unificado; correção de contraste (3.7).
4. Sidebar nova (`nav.ts` com ícones/badges/grupos, bloco de contexto, rodapé em menu de usuário) + cabeçalho mobile com título.
5. `EmptyState` com ícone+ação; Visão geral nova (faixa de atenção + KPIs + "Comece por aqui").

**Rodada 2**: `DataTable` responsiva (Fontes, Usuários, Publicações, Auditoria), barra de ação sticky + auto-avançar + "Desfazer" na Revisão, Tabs/Stepper/Field/Select, `ConfirmDialog` + remoção de `confirm/alert`, Agenda mobile em lista, Contas/Canais redesenhados, paleta `Ctrl+K`, sidebar colapsável, bottom nav mobile.

### 3.9 A confirmar com o dono antes de implementar
1. **Mudar o escuro** (página `slate-950`, cards `slate-900`) e o **ativo da sidebar** de indigo cheio para `primary-soft` + barra: ambos mudam bastante o visual; ele valoriza destaque claro, então sugerimos manter o indigo cheio **somente** no item ativo se preferir mais impacto (alternativa: `bg-primary text-white shadow-sm`).
2. **Contagens na sidebar** (Revisão, Publicações, Séries) exigem polling em `GET /api/dashboard/summary` (já existente); confirmar se `GET /series` ou o summary podem expor "episódios aguardando ação" agregado (backend-specialist, mudança de contrato aditiva).
3. **Mover Canais/Contas/Auditoria/Encurtadores** para "Biblioteca & configuração" e "Nova série" para botão: muda a ordem do menu que ele já conhece.
4. Esconder "Encurtadores" até existir, ou manter como "Em breve"?
5. Fonte Inter via `next/font` (self-hosted no build, sem requisição externa em runtime): ok?
