# Séries IA — especificação de UI/UX

Para o frontend-specialist. Base: `docs/series-ia-plano.md` (contrato REST seção 2, máquinas de estado seção 3). Padrão visual: Tailwind, `slate` + `indigo` como cor de ação, `dark:` por classe, PT-BR, `Dialog` com `bg-black/70 backdrop-blur-sm`, `shadow-2xl`, `ring-1`. Nenhum token novo.

## 0. Princípios

1. **Custo é visível antes de ser gasto.** Estimativa no wizard, no card, na aprovação do roteiro, no Custos. Sempre `US$ 0,00` (pt-BR, 2 casas; 4 casas abaixo de US$ 0,01).
2. **Dois portões humanos, explicados.** "Aprovar roteiro" libera gasto de mídia. "Aprovar vídeo" libera publicação. A UI diz isso em cada botão (texto de apoio), não só no tooltip.
3. **Status nunca só por cor.** Todo chip tem texto, e os de personagem têm também ícone/símbolo.
4. **Polling só em estado transitório**, ver seção 9.
5. **Mobile-first.** Layouts em coluna única e viram 2 ou 3 colunas a partir de `md`/`lg`.

## 1. Navegação e rotas

Novo grupo em `lib/nav.ts`, entre "Cortes" e "Encurtadores":

```
{ id: "series", label: "Séries IA", href: "/series", items: [
  { href: "/series", label: "Minhas séries" },
  { href: "/series/nova", label: "Nova série" } ] }
```

| Rota | Conteúdo |
|---|---|
| `/series` | Lista (filtra por canal global do `ChannelPicker` + select de status) |
| `/series/nova` | Wizard. **Página, não modal**: tem 5 passos e conteúdo longo. |
| `/series/[id]` | Tela da série. Aba em `?aba=geral\|biblia\|episodios\|custos` (default `geral`). |
| `/series/[id]?aba=episodios&ep=7` | Abre o drawer do episódio 7 (deep link e botão voltar fecham o drawer). |

Cada página usa o contêiner `mx-auto max-w-4xl` (lista e wizard) ou `max-w-6xl` (série). Título `h1 text-2xl font-semibold`, subtítulo `text-sm text-slate-600`. Segue `app/cortes/jobs/page.tsx`. Respeita o `AdminViewPicker` (`as_user` via `api.ts`) e mostra "Dono: X" em card e tabela como no `ClipCard`.

## 2. Mapa de status (rótulos PT e variante de `Badge`)

Série (`SeriesStatusBadge`):
planning "Planejando…" info · planned "Plano pronto" warning · plan_failed "Falha no plano" danger · active "Ativa" success · paused "Pausada" warning · completed "Concluída" success · canceled "Cancelada" neutral.

`pause_reason` (texto abaixo do chip): user "Pausada por você" · series_budget_exceeded "Orçamento da série estourado" · user_ai_budget_exceeded "Orçamento mensal de IA estourado" · storage_quota_exceeded "Cota de armazenamento cheia" · provider_unavailable "Provedor indisponível".

Episódio (`EpisodeStatusBadge`), com o **grupo** que define o `aria-label` e a ação esperada:

| status | rótulo | variante | atenção do usuário |
|---|---|---|---|
| planned | Planejado | neutral | não |
| scripting | Escrevendo roteiro… | info | não |
| validating | Validando roteiro… | info | não |
| script_ready | Roteiro pronto | info | não |
| awaiting_script_approval | **Aprovar roteiro** | warning | **sim** |
| generating_media | Gerando mídia… | info | não |
| assembling | Montando vídeo… | info | não |
| pending_review | **Aprovar vídeo** | warning | **sim** |
| approved | Aprovado (sem horário) | success | não |
| scheduled | Agendado | success | não |
| published | Publicado | success | não |
| rejected | Rejeitado | danger | sim |
| needs_attention | **Precisa de atenção** | danger | **sim** |
| stale | Desatualizado | warning | sim |
| canceled | Cancelado | neutral | não |

Estados com "…" mostram um spinner `animate-spin` de 12 px dentro do chip (respeita `motion-reduce:animate-none`).

Fase do arco (`ArcPhaseChip`, neutro, com rótulo): setup "Apresentação" · rising "Tensão crescente" · midpoint "Virada" · escalation "Escalada" · climax "Clímax" · resolution "Desfecho".

Status de personagem (`CharacterStatusBadge`, ícone + texto + cor; o ícone é texto, sem dependência):

| status | rótulo | símbolo | variante |
|---|---|---|---|
| alive | Vivo | ● | success |
| injured | Ferido | ✚ | warning |
| missing | Desaparecido | ? | neutral (borda tracejada) |
| transformed | Transformado | ✦ | info |
| dead | Morto | ✝ | danger |

Avatar do personagem morto: imagem em escala de cinza (`grayscale`) e nome com `line-through` opcional **não**, porque prejudica a leitura; usar só o selo ✝ sobre o avatar.

Status de job de mídia: queued "Na fila" neutral · submitted "Enviado" info · running "Gerando" info · succeeded "Pronto" success · failed "Falhou" danger · canceled "Cancelado" neutral.

## 3. Lista de séries (`/series`)

```
Séries IA                                         [ + Nova série ]
Histórias em 20 episódios de 30 s, geradas por IA.   Status [Todas v]
+-----------------------------------------------------------------+
| ● Canal Mistério          [Ativa]                  Dono: ana    |
| A Casa dos Ecos                                                 |
| ▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯  7/20 aprovados · 5 publicados             |
| Próximo: Ep. 8 "A porta" · 16/10 18:00 · [Aprovar vídeo]        |
| Custo: US$ 3,40 de US$ 12,00 (28%)  · estimado/ep. US$ 0,60     |
| ⚠ 1 episódio precisa de atenção                                 |
+-----------------------------------------------------------------+
```

- Card inteiro é `<Link>` para a série (um link por card, evita 2 alvos de foco); o selo de atenção é texto dentro do link.
- Grade: 1 coluna, `md:grid-cols-2`.
- **Barra de progresso de 20 segmentos** (`EpisodeProgressBar`): cada segmento colorido por status agregado (published/scheduled/approved verde, pending_review/awaiting âmbar, em andamento índigo, planned cinza, needs_attention/failed vermelho). `role="img"` com `aria-label="7 de 20 episódios aprovados, 2 aguardando sua ação"`; legenda textual ao lado, nunca só cor. Fonte: `progress` do `SeriesRead`.
- "Próximo episódio" vem de `next_episode`; se o status for de atenção, o texto vira a ação ("Aprovar roteiro do Ep. 8").
- Custo: `UsageBar`-like (reaproveitar `UsageBar` com `formatValue` em USD) quando há `budget_limit_usd`; senão texto "Sem limite de orçamento". Linha "Estimado: US$ X/episódio · US$ Y/temporada" a partir de `estimated_cost`.
- Série pausada: faixa âmbar com `pause_reason` traduzido e botão "Retomar" no card **não** (ações só dentro da série; evita clique acidental).
- Ordenação: séries com atenção primeiro, depois ativas, depois o resto.
- **Vazio**: `EmptyState` "Você ainda não tem séries" / "Descreva uma ideia e a IA planeja 20 episódios de 30 segundos para você aprovar antes de gastar com mídia." / botão "Criar primeira série". Se não há canais: "Crie um canal com ao menos uma conta conectada antes" + link para `/cortes/canais`.
- **Carregando**: `SkeletonList rows=3` (altura 36 de card). **Erro**: caixa vermelha `role="alert"` com "Não foi possível carregar as séries" + botão "Tentar novamente".

## 4. Wizard de criação (`/series/nova`)

Página com 5 passos e rodapé fixo (`sticky bottom-0`) com "Voltar" e "Continuar"/"Criar série". Indicador no topo: lista `<ol>` com `aria-current="step"`, em mobile só "Passo 2 de 5 — Estilo". Estado guardado em memória (`useReducer`), sem localStorage. Avisa antes de sair (`beforeunload`) se houver alteração. Validação por passo ao clicar em Continuar; erros inline com `aria-describedby` e foco no primeiro campo inválido.

```
Passo 1  Ideia        Passo 2  Estilo e custo   Passo 3  Provedores e voz
Passo 4  Publicação   Passo 5  Revisão e atestação
```

**Passo 1 — Ideia**
- Título (opcional, máx. 120). Ajuda: "Deixe vazio e a IA sugere um título."
- Premissa (`textarea`, 6 linhas): contador `0/4000` ao vivo, mínimo 50. O contador usa `aria-live="polite"` só ao cruzar limites (50 ok, 3800 perto do fim). Texto de ajuda: "A premissa não pode ser alterada depois. Escreva o ponto de partida, o conflito e o tom. Os personagens e o desfecho a IA cria."
  - Faixa abaixo de 50: "Faltam N caracteres" em âmbar; vermelho só ao tentar continuar.
- Gênero (select com opções + "Outro" que abre texto) e Tom (select: sombrio, leve, suspense, dramático, humor, esperançoso + Outro). Os dois são strings livres no contrato (`genre`, `tone`).
- Canal (select, mesmo estilo do `ChannelPicker`, com `ChannelColorDot`). Obrigatório. Abaixo do select, lista as plataformas das contas do canal em chips ("YouTube, TikTok"). Se o canal não tem contas: aviso "Este canal não tem contas. Você pode criar a série, mas só poderá iniciá-la depois de conectar uma conta" (o `start` retorna `channel_without_accounts`). Link "Gerenciar contas".

**Passo 2 — Estilo visual e custo** (o passo mais importante)

Três cartões de escolha (`role="radiogroup"`, cada um `role="radio"`, setas navegam):

```
( ) Economia            ( ● ) Híbrido (recomendado)   ( ) Vídeo completo
Só imagens animadas     1 cena em vídeo + imagens     Todas as cenas em vídeo
~US$ 0,12 / episódio    ~US$ 0,55 / episódio          ~US$ 2,10 / episódio
~US$ 2,40 / temporada   ~US$ 11,00 / temporada        ~US$ 42,00 / temporada
Mais barato. Efeito     Equilíbrio: movimento real    Mais caro. Todas as cenas
"slideshow com zoom".   nas cenas de maior impacto.   em movimento real.
```

- Estimativa calculada no cliente a partir de `GET /api/series/providers` (`est_cost_usd`: vídeo por segundo, imagem por imagem, TTS por 1k caracteres) com as suposições mostradas por extenso em um bloco "Como calculamos": 30 s por episódio, ~4 cenas, ~450 caracteres de narração, 20 episódios, mais um custo de LLM aproximado fixo `~US$ 0,15/ep.` (constante de front sinalizada como aproximação; o `SeriesRead.estimated_cost` do backend é a fonte oficial e substitui o valor local após criar a série).
- Rótulo sempre "estimativa" com `~`. Se algum provedor tiver `est_cost_usd` ausente, o valor aparece como "—" e uma nota "Preço não informado pelo provedor".
- Em `hybrid`: campo numérico "Cenas em vídeo por episódio" (1 a 6, default 1) com texto "Cada cena em vídeo custa mais que uma imagem. O padrão é 1." Em `economy`/`full_video` o campo fica oculto.
- Se o provedor de vídeo não está configurado, `full_video`/`hybrid` mostram aviso âmbar "Nenhum provedor de vídeo configurado. Use Economia ou peça ao administrador para configurar" e `hybrid`/`full_video` ficam selecionáveis, mas o passo 3 bloqueia (ver abaixo).

**Passo 3 — Provedores e voz**
- Imagem: select com provedores de `providers.image` (nome, "configurado"/"não configurado", custo por imagem). Obrigatório sempre.
- Vídeo: select, visível e obrigatório só em `hybrid`/`full_video`. Mostra durações permitidas e se aceita imagens de referência.
- Narração (TTS): select de provedor, depois select de voz carregada de `GET .../tts/{id}/voices?language=pt-BR`.
- Cada provedor `configured=false` aparece desabilitado com "(não configurado)". Para admin, link "Configurar chave" para `/cortes/contas`; para usuário comum, "Peça ao administrador". Provedores `fake` levam o sufixo "(teste, sem custo)" com `Badge` info.
- **Preview de voz**: cada voz na lista é uma linha com nome, gênero e botão "Ouvir" (`<audio>` controlado, um único áudio por vez; ao tocar outro, o anterior para). `aria-label="Ouvir voz Camila"`, botão alterna "Parar". Sem `preview_url`: botão desabilitado com "Sem prévia". Erro ao carregar vozes: mensagem inline + "Tentar novamente"; não bloqueia se o provedor for `fake`.
- Opção avançada (colapsada) "Modelos de IA" não é exposta; `planner_model`/`writer_model` ficam fora da UI.

**Passo 4 — Publicação e orçamento**
- Horário de publicação (`input type=time`, default 18:00) e fuso (select, default `America/Sao_Paulo`).
- Antecedência (`lead_days`): rádio "1 dia" / "2 dias (recomendado)". Texto: "Quantos dias antes da publicação o episódio começa a ser preparado. Com 2 dias você tem mais folga para aprovar roteiro e vídeo."
- Privacidade: radio público / não listado / privado, mapeando `privacy` (`public`, `private`, `self_only`; rótulos "Pública", "Privada", "Só eu"). Default pública.
- "Exigir aprovação do roteiro antes de gerar mídia" (switch, **ligado**). Desligar mostra aviso: "Sem essa aprovação a IA gasta com imagens, vídeo e voz assim que o roteiro estiver pronto."
- Limite de regenerações por episódio (0 a 10, default 3), com ajuda "Evita gasto repetido no mesmo episódio".
- Orçamento da série (US$, opcional). Ajuda: "Ao atingir o limite a série é pausada automaticamente." Mostra ao lado a estimativa da temporada e, se o limite for menor que ela, aviso âmbar "Abaixo da estimativa (US$ 11,00): a série deve pausar antes do fim." Mostra o orçamento mensal restante se `/api/me/usage` trouxer `monthly_ai_budget_usd`.
- Monetização permitida (switch, default ligado): "Marque se o canal será monetizado. Isso afeta quais plataformas podem publicar." Link informativo sobre risco de desmonetização de conteúdo gerado em massa.

**Passo 5 — Revisão e atestação**
- Resumo em `dl` de todos os campos, cada um com link "Editar" que volta ao passo.
- Bloco de custo: "Estimativa da temporada: US$ X (US$ Y por episódio). Você só gasta com mídia depois de aprovar cada roteiro." Em destaque.
- **Atestação (checkbox obrigatório, sem pré-marcar)**, texto exato:

> Declaro que a premissa é de minha autoria ou que tenho direito de usá-la, e que não pede para copiar personagens, histórias, marcas ou universos protegidos por direitos autorais, nem retratar pessoas reais. Entendo que o conteúdo é gerado por inteligência artificial, será publicado com o rótulo de conteúdo gerado por IA nas plataformas que oferecem esse recurso, e que sou responsável pelo que for publicado no meu canal.

- Abaixo, nota: "A IA recusa premissas que copiem obras protegidas. Cada episódio ainda passa pela sua aprovação antes de ir ao ar."
- Botão primário "Criar série e planejar" desabilitado até o checkbox ser marcado (com `aria-disabled` e texto de ajuda "Marque a declaração para continuar"). Ao enviar: botão em estado "Criando…", sem duplo clique. `originality_attestation: true` só é enviado marcado.
- Sucesso (201): navega a `/series/{id}` com toast "Série criada. A IA está planejando os 20 episódios."
- Erros do POST (ver seção 10): 404 canal → volta ao passo 1; 422 (campo) → volta ao passo do campo e mostra o erro inline; `active_series_limit` → banner no topo do passo 5.

## 5. Tela da série (`/series/[id]`)

Cabeçalho (sticky em `md+`): título, `SeriesStatusBadge`, `ChannelColorDot` + canal, resumo de progresso, custo `US$ X / limite`, e menu de ações. Em mobile as ações vão num botão "Ações" que abre a `Dialog` de ações.

Ações por estado:
- planned: **Iniciar série**, Replanejar, Cancelar, Excluir.
- plan_failed: Replanejar, Excluir.
- active: Pausar, Cancelar.
- paused: Retomar, Cancelar.
- planning/completed/canceled: sem ações primárias (Excluir quando permitido).

Confirmações (`Dialog`, foco no botão seguro):
- **Iniciar**: campo "Data do primeiro episódio" (`start_date`, mínimo hoje + lead_days, default esse mínimo), resumo "Ep. 1 vai ao ar em 17/10 às 18:00; a IA começa a preparar agora" e estimativa da temporada. Aviso se algum provedor selecionado perdeu a configuração.
- **Cancelar**: checkbox "Cancelar também as publicações já agendadas" (`cancel_scheduled_publications`), texto "Episódios publicados continuam no ar".
- **Excluir**: "Esta ação não pode ser desfeita." Só habilitado quando o backend permitir; senão mostra o `invalid_transition` traduzido.
- **Replanejar**: textarea de instruções opcionais.

Abas: `role="tablist"`, setas esquerda/direita, `Home`/`End`, `aria-selected`, painéis `role="tabpanel"` com `aria-labelledby`. Em mobile a lista de abas rola horizontalmente (`overflow-x-auto`). Aba "Episódios" mostra contador de atenção `(2)` e "Bíblia" não tem contador.

### 5.0 Estados da série antes de ativa

- `planning`: no lugar das abas, painel central com spinner e "A IA está lendo sua premissa e planejando a temporada. Costuma levar alguns minutos." Polling. Botão "Cancelar".
- `plan_failed`: painel vermelho `role="alert"` com `series.error` e botões "Replanejar" (abre instruções) e "Excluir".
- `planned`: banner índigo fixo no topo da aba Visão geral: "O plano está pronto. Revise a bíblia e os episódios; quando estiver satisfeito, inicie a série." com botão **Iniciar série**. Nesse estado a Bíblia e as sinopses são editáveis (`PUT outline`).

### 5.1 Aba Visão geral — agenda em linha do tempo

```
Próximo passo para você
+--------------------------------------------------------------+
| Ep. 8 está aguardando aprovação do vídeo  [Revisar episódio] |
+--------------------------------------------------------------+
Linha do tempo (20 dias)
 ●──●──●──●──●──●──●──◐──○──○──○──○──○──○──○──○──○──○──○──○
 1  2  3  4  5  6  7  8  9 10 11 12 ...                   20
 15/10 ... cada nó: nº, data, status
Resumo:  Publicados 5 · Agendados 2 · Aguardando você 1 · Falhas 0
Arco:  Apresentação 1-3 | Tensão 4-9 | Virada 10-11 | ...
```

- Bloco "Próximo passo para você" no topo, derivado de episódio com atenção (prioridade: needs_attention, awaiting_script_approval, pending_review, stale). Um botão por item que abre o drawer. Se nada requer ação: "Nada pendente. O próximo episódio é o Ep. 9, em 17/10 às 18:00."
- **Linha do tempo**: lista de 20 itens (`<ol>`), em desktop horizontal com rolagem, em mobile **vertical** (cada item: bolinha de status, "Ep. 8 · 16/10 (qui) 18:00 · título · chip"). Cada item é `<button>` que abre o drawer. A data exibe `target_date` e, quando `scheduled_at` difere (agenda empurrada +1 dia), mostra "adiado 1 dia" em âmbar com `title` explicando. Faixas de fase do arco como agrupadores sutis (rótulo sobre os nós).
- Hoje marcado com "Hoje" no nó correspondente; nó selecionado anexa `aria-current="date"`.
- Cartões laterais (em `lg`, coluna direita): **Custo** (acumulado, limite, estimativa restante), **Configuração** (estratégia, provedores, voz, horário, lead_days), com botão "Editar" abrindo `Dialog` (PATCH: título, horário, antecedência, privacidade, orçamento, regenerações, provedores/estratégia; premissa aparece somente leitura com cadeado e o texto "A premissa não pode ser editada").
- Se `pause_reason`: faixa âmbar com o motivo e a ação sugerida (ex.: "Aumente o orçamento em Configuração e retome").

### 5.2 Aba Bíblia

Três blocos em `<details>`/seções colapsáveis (abertas no desktop): **Mundo**, **Estilo**, **Personagens**; "Eventos" é uma seção própria. Botão único "Editar bíblia" liga o modo edição (campos viram inputs, "Salvar"/"Descartar" fixos no rodapé). Salvar envia `PUT bible` com `bible_version`.

- **Aviso de impacto** antes de salvar: "Salvar a bíblia marca como Desatualizados os episódios com roteiro pronto ou aguardando aprovação (N episódios). Eles serão reescritos." Confirma em `Dialog`.
- `bible_version_conflict`: mensagem + "Recarregar" (descarta edição local, com confirmação se houver alterações).
- Mundo: cenário, época, regras (lista editável), locais (nome + descrição visual). Estilo: voz de narração, estilo visual (textarea com contador 300), elementos proibidos (chips removíveis). Premissa-núcleo (`premise_core_elements`): chips somente leitura com cadeado.
- Arco da temporada: tema, pergunta central, resumo do final. Fios abertos: lista com chip "aberto desde Ep. X / previsto Ep. Y / fechado no Ep. Z".

**Personagens** — grade de cards, 1 col mobile, 2 `md`, 3 `lg`:

```
+--------------------------+
| [avatar 9:16 mini] ✝ Morto|
| Marina  · Protagonista   |
| Introduzida no Ep. 1     |
| Descrição curta (2 linhas)|
| ✝ Ep. 12: morreu em ...  |
| [Editar] [Imagem de ref.]|
+--------------------------+
```

- Avatar: imagem de referência (via GET `reference-image`, `loading="lazy"`, `alt="Referência visual de Marina"`), ou placeholder com iniciais.
- Selo de `committed`: quando `committed=false` mostra "Proposto" (personagem ainda não confirmado por episódio aprovado); `true` mostra nada.
- **Editar** (`Dialog`): nome, papel (select), descrição, descrição visual (com texto "Vai em todo prompt de imagem/vídeo. Mantenha idade aparente, cabelo e roupa fixos"), personalidade. Status **somente leitura**, com o texto "O status só muda por eventos dos episódios aprovados."
- **Imagem de referência**: botão "Enviar imagem" abre seletor de arquivo (`accept="image/png,image/jpeg,image/webp"`), valida no cliente tipo e 5 MB, prévia e "Salvar"; "Remover imagem" com confirmação. Textos de ajuda: "Ajuda a manter o mesmo rosto entre cenas, em provedores que aceitam referências. Você deve ter direito de usar a imagem; não envie fotos de pessoas reais sem autorização." Se o provedor de imagem/vídeo tem `supports_reference_images=false`, aviso "O provedor escolhido ignora imagens de referência" (não bloqueia). Erros 413/415 traduzidos (seção 10).
- Ordenação padrão: protagonistas, depois status vivos antes de mortos; filtro rápido "Todos / Vivos / Mortos / Outros".

**Linha do tempo de eventos** (`CharacterEventTimeline`): lista cronológica por episódio, filtrável por personagem.

```
Ep. 12  ✝ Marina morreu                         [Aplicado]
        "Cai do mirante durante a perseguição."
Ep. 13  ✚ Davi ficou ferido                    [Proposto]   (tracejado)
```

- **Aplicado** (`state=applied`): linha sólida, chip success "Aplicado". **Proposto** (`proposed`): borda tracejada, chip warning "Proposto — só vale ao aprovar o vídeo". Eventos `discarded` ficam ocultos por padrão (toggle "Mostrar descartados", riscado + chip neutro).
- Cada evento tem link "Ver episódio" (abre o drawer).
- Texto de ajuda fixo no topo: "Mortes e mudanças de status propostas pela IA só entram em vigor quando você aprova o vídeo do episódio."

### 5.3 Aba Episódios

Alternância Grade/Lista (`role="group"` com botões `aria-pressed`, preferência em `localStorage`). Filtro "Precisam de ação" (toggle) e fase do arco.

Grade (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`), cartão por episódio:

```
+----------------+
| [thumb 9:16]   |  thumb do Clip se existir (lazy), senão placeholder com nº
| Ep. 7          |
| O silêncio     |
| Escalada       |  ArcPhaseChip
| [Aprovar vídeo]|  EpisodeStatusBadge
| 16/10 18:00 · US$0,52 |
+----------------+
```

Lista (tabela em `md+`, empilhada em mobile): Nº, título, fase, status, data, custo, regenerações `1/3`. Linha inteira é botão que abre o drawer. Episódios `stale`/`needs_attention` com `error` mostram a primeira linha do erro em texto pequeno vermelho.

### 5.4 Aba Custos

```
Total: US$ 3,40   Limite: US$ 12,00   [=====-----] 28%
Estimado restante: US$ 8,20 (temporada: US$ 11,60)
Por tipo:   Texto (LLM) 0,90 | Vídeo 1,80 | Imagem 0,50 | Voz 0,20   (barras + valores)
Por episódio (tabela): Ep | custo | % do total        (barras horizontais)
Últimas 100 operações: data | tipo | provedor | modelo | episódio | custo
```

- Barras (não gráfico de pizza) com valores textuais ao lado; `role="img"` com `aria-label` resumido. Tabela "Últimas operações" com cabeçalho e `<caption class="sr-only">`.
- Faixa vermelha se `total_usd >= budget_limit_usd`: "Orçamento atingido. A série foi pausada." + botão "Editar orçamento". Âmbar a partir de 80%.
- Mostra também o orçamento mensal de IA (`/api/me/usage`: `ai_spend_month_usd` / `monthly_ai_budget_usd`) com `UsageBar`.
- Aviso de transparência: "Os valores são estimativas do provedor e podem diferir da fatura." Colunas de custo estimado vs. real quando ambos existirem nos jobs.
- Vazio: "Nenhum gasto ainda. O primeiro custo aparece quando a IA planejar a série." Estado de erro/carregando padrão.

## 6. Episódio (drawer lateral, `EpisodeDrawer`)

**Decisão:** drawer à direita (`max-w-3xl`) em `md+`, **tela cheia** em mobile; mesmo comportamento de foco do `Dialog` (reusar o hook de focus-trap extraído do `Dialog`, ou estender `Dialog` com `variant="drawer"`). Backdrop `bg-black/70 backdrop-blur-sm`, painel com `shadow-2xl ring-1`, `dark:bg-slate-800`. Fecha com Esc, backdrop e "Fechar"; devolve o foco ao card. URL com `?ep=N`. Navegação "Ep. anterior / Próximo" no cabeçalho, com setas do teclado **apenas** com foco nesses botões (não capturar setas globais).

Cabeçalho: "Ep. 7 · O silêncio", `EpisodeStatusBadge`, `ArcPhaseChip`, data de publicação, custo `US$ 0,52`, regenerações `1/3`. Abaixo, uma **barra de etapas** (`<ol>`): Roteiro → Aprovar roteiro → Mídia → Montagem → Aprovar vídeo → Agendado/Publicado, com a etapa atual destacada e `aria-current="step"`. É o principal mapa de "onde estou".

```
+-- Ep. 7 · O silêncio  [Aprovar roteiro]  Escalada      [<][>][X] --+
| Roteiro > [Aprovar roteiro] > Mídia > Montagem > Vídeo > Agendado  |
|--------------------------------------------------------------------|
| Banner de ação do estado atual (ver tabela)                        |
| Sinopse (outline): resumo, eventos-chave, mudanças planejadas,     |
|   cliffhanger                                                      |
| Validação:  ✔ Aprovado  Fidelidade 0,86 · Coerência 0,91 · ...     |
|   [BLOCKER] Cena 3: personagem morto aparece  — sugestão ...       |
|   [aviso]   Cena 2: gancho fraco              — sugestão ...       |
| Roteiro (revisão 3)                                                |
|  Cena 1 · 6 s · imagem · Marina, Davi       [Editar]               |
|   Narração: "..."   Visual: "..."                                  |
| Eventos de estado propostos                                        |
| Vídeo (9:16) ........ player | Jobs de mídia (tabela)              |
|--------------------------------------------------------------------|
| [Regenerar…]   [Rejeitar]            [Aprovar roteiro (gera mídia)]|
+--------------------------------------------------------------------+
```

Rodapé de ações (`sticky bottom-0`, em mobile empilha com o primário em cima). O primário é **um só por estado**:

| status | banner | ações |
|---|---|---|
| planned/stale | "Ainda não escrito" / "Desatualizado: a bíblia ou o episódio anterior mudou. Será reescrito." | Editar sinopse (planned/stale); **Reescrever agora** (stale, chama regenerate scope=script) |
| scripting/validating | "A IA está escrevendo/validando o roteiro." | nenhuma, só ver |
| script_ready | "Roteiro pronto, aguardando próxima etapa." | ver |
| awaiting_script_approval | "Revise o roteiro. Ao aprovar, a IA gera imagens, vídeo e voz (custo estimado: US$ 0,55)." | **Aprovar roteiro**; Regenerar; Editar roteiro. Primário desabilitado com blockers (ver abaixo) |
| generating_media/assembling | "Gerando mídia…" com jobs ao vivo | nenhuma (cancelar não existe no contrato) |
| pending_review | "Revise o vídeo. Ao aprovar, ele é agendado e os eventos de personagem entram em vigor." | **Aprovar vídeo**; Rejeitar; Regenerar |
| approved | "Aprovado, mas sem horário livre. O sistema tenta de novo automaticamente." | Desaprovar |
| scheduled | "Agendado para 17/10 às 18:00." | Desaprovar |
| published | "Publicado." Links para publicações | nenhuma |
| rejected | "Rejeitado." com instruções usadas | Regenerar |
| needs_attention | Erro (`episode.error`) em `role="alert"` | Regenerar (escopo sugerido); Editar roteiro |
| canceled | texto | nenhuma |

### 6.1 Sinopse, roteiro e edição

- Sinopse (`outline`) em leitura; editável (textarea + eventos-chave) só em `planned`/`stale` via `PUT outline`.
- Roteiro: lista de **cartões de cena** (3 a 6): índice, `duration_s`, `visual_mode` (chip "Vídeo"/"Imagem"; ícone + texto), personagens em cena (chips, morto com ✝), local, câmera, clima, flashback (chip "Flashback"). Mostra **soma de duração** e **contagem de palavras** do total e por cena, com o intervalo alvo ("26–34 s", "55–85 palavras") em verde/âmbar/vermelho + texto.
- Modo edição do roteiro (botão "Editar roteiro", disponível em `awaiting_script_approval`, `script_ready`, `needs_attention`): cada cena vira formulário com Narração (textarea), Prompt visual em inglês (textarea, contador 600, dica "Descreva só o visual. Sem texto na tela, sem falas"), Modo visual (radio Vídeo/Imagem, **mostra impacto de custo** "Vídeo +US$ 0,35 nesta cena"; em `hybrid` avisa se passa de `max_video_scenes_per_episode`), Personagens (multiselect pelos keys), Local (select), Duração (select com `allowed_durations` quando vídeo), Câmera, Clima, Flashback (checkbox). Reordenar/adicionar/remover cena: botões "Subir/Descer" (acessíveis, sem drag obrigatório), "Remover cena" com confirmação, "Adicionar cena" até 6.
- Salvar edição (`PUT script` com `script_revision`): rodapé "Salvar e validar". Aviso: "Salvar volta o episódio para validação e invalida mídia já gerada." Em `script_revision_conflict`: banner "O roteiro mudou enquanto você editava" + "Recarregar" (não sobrescreve).
- Edição bloqueada (somente leitura com explicação) em `generating_media`/`assembling`/`published`: "Aguarde a geração terminar" (`episode_busy` coberto).
- Eventos de estado propostos (`state_events`): lista com ícone do novo status, "Marina: vivo → morto (proposto)". Eventos de `dead` ficam em destaque âmbar: "Esta cena mata um personagem. Só entra em vigor ao aprovar o vídeo."

### 6.2 Relatório de validação

- Cabeçalho: resumo "Sem bloqueios" (success) ou "N bloqueios, M avisos" (danger/warning). Notas `premise_fidelity`, `coherence`, `interest`, `outline_adherence` em barras 0 a 1 com valor numérico, tentativas "Tentativa 2 de 3".
- Cada `issue`: chip **Bloqueio** (danger) ou **Aviso** (warning) + código traduzido + "Cena N" (botão que rola até a cena e dá foco) + mensagem + "Sugestão: …". Blockers primeiro.
- Rótulos de código: premise_drift "Fuga da premissa" · outline_deviation "Fuga da sinopse" · dead_character_appears "Personagem morto em cena" · status_contradiction "Contradição de status" · unresolved_reference "Referência não resolvida" · ip_infringement "Possível cópia de obra protegida" · real_person "Pessoa real" · unsafe_content "Conteúdo inadequado" · weak_hook "Gancho fraco" · pacing_overload "Ritmo sobrecarregado". Código desconhecido: mostra o código cru.
- **Aprovar com blocker**: o botão fica `aria-disabled` com o motivo ("Resolva N bloqueios: edite o roteiro ou regenere"). Nunca oferecer "aprovar mesmo assim" (o backend só leva a `script_ready` sem blockers; aprovar é impossível nesses casos).
- Validação ausente (`null`): "Ainda não validado".

### 6.3 Regenerar, rejeitar, desaprovar

- **Regenerar** (`Dialog`): Escopo (radio com custo): "Só o roteiro" (custo baixo, texto), "Só a mídia (imagens e vídeo)" (custo estimado), "Só a narração" (custo baixo). Instruções (textarea opcional, 500). Contador "Regenerações usadas: 1 de 3". Em limite: botão desabilitado + mensagem `regeneration_limit_reached`. Confirma com "Regenerar (custa até US$ X)". Resposta 202: fecha, toast "Regeneração iniciada", drawer entra em polling.
- **Rejeitar**: instruções opcionais, checkbox "Regenerar em seguida" (default ligado) + escopo se ligado. Texto: "Rejeitar não publica o episódio e libera a agenda +1 dia se passar do horário."
- **Desaprovar**: `Dialog` de confirmação destrutiva (botão vermelho): "O episódio volta para revisão, as publicações agendadas serão canceladas, os eventos de personagem voltam a propostos e os episódios seguintes ficam Desatualizados." Se `invalid_transition`: mensagem de que já foi publicado ou que o seguinte está aprovado ("Desaprove primeiro o Ep. 8").
- **Aprovar vídeo**: botão direto, sem modal, mas com texto de apoio; erro `previous_episode_not_approved` mostra banner "Aprove o Ep. 6 antes" com link que troca o drawer para Ep. 6. Sucesso: toast "Episódio aprovado e agendado para 17/10 às 18:00" ou "aprovado, aguardando horário livre" (status `approved`).
- **Aprovar roteiro**: botão direto. Antes mostra custo estimado do episódio na própria linha de apoio; sem confirmação extra. Orçamento estourado → `series_budget_exceeded`/`user_ai_budget_exceeded` traduzidos, com atalho "Editar orçamento".
- Ações em andamento: botão com spinner e `aria-busy`, demais ações desabilitadas (evita `episode_busy`).

### 6.4 Vídeo e jobs de mídia

- Player 9:16: `<video controls playsInline preload="metadata" poster=thumbnail>` com `src` em `GET /api/clips/{clip_id}/video`, largura `w-full max-w-[280px]` centralizado (mobile) e coluna fixa de 280 px ao lado dos jobs em `lg`. Reaproveitar o player de `ClipDetailDialog`. Legendas/descrição: link "Ver metadados" abre o detalhe do corte na Revisão (`/cortes/revisao`). Aviso: chip "Conteúdo gerado por IA" sobre o player. Sem clipe: placeholder "O vídeo aparece aqui quando a montagem terminar".
- **Jobs de mídia**: tabela (cartões empilhados em mobile) com Tipo (Vídeo / Imagem / Voz + `cena N`), Provedor, Status, Tentativas, Duração, Custo (`estimado → real` quando houver), Erro (truncado com "Ver mais"). Linha-resumo: "5 de 6 prontos". Barra de progresso de jobs (`role="progressbar"`) durante `generating_media`.
- Job `failed` com `error` em `role="alert"`; o texto de recusa de segurança do provedor é traduzido ("O provedor recusou a cena por segurança. Edite o prompt visual da cena").
- Publicações (`publications`): lista com `PublicationStatusBadge`, conta, plataforma, data, e selo "IA" (`synthetic_media`).

## 7. Estados globais

| Situação | Tratamento |
|---|---|
| Carregando lista/série | `Skeleton`s no formato final (cards, abas, linha do tempo), `aria-busy="true"` |
| Carregando drawer | Cabeçalho com dados do summary + `Skeleton` no corpo |
| Erro de carga (rede/5xx) | Caixa `role="alert"` + "Tentar novamente"; dados antigos continuam visíveis se já existiam |
| 404 série | `EmptyState` "Série não encontrada" + link "Voltar para Séries" (cross-owner também vira 404) |
| 401 | Fluxo existente de `redirectToLogin` |
| Offline durante polling | Pausa polling, banner "Sem conexão. Tentando de novo…", retoma com `online` |
| Mutação em andamento | Botão com spinner, desabilita irmãos, mantém foco |
| Sucesso | `useToast` ("success") |

## 8. Mensagens de erro (PT) por `detail.code`

Mostrar `detail.message` do backend **não**: usar o mapa abaixo (o backend pode estar em outro idioma ou mudar). Código desconhecido: usar `detail.message` se existir, senão "Algo deu errado. Tente novamente."

| code | Mensagem | Onde/ação |
|---|---|---|
| channel_without_accounts | "Este canal ainda não tem contas conectadas. Conecte ao menos uma conta para publicar." | Banner + link para Contas |
| provider_not_configured | "O provedor escolhido não está configurado. Peça ao administrador para cadastrar a chave ou escolha outro provedor." | Banner; admin vê link para Contas |
| invalid_transition | "Esta ação não está disponível no estado atual. Atualize a página e confira o status." | Toast + recarrega |
| previous_episode_not_approved | "Aprove o episódio anterior antes deste." | Banner + link p/ episódio N-1 |
| regeneration_limit_reached | "Limite de regenerações deste episódio atingido. Edite o roteiro manualmente ou aumente o limite na configuração da série." | Desabilita regenerar |
| series_budget_exceeded | "O orçamento desta série foi atingido. Aumente o limite para continuar gerando." | Banner + "Editar orçamento" |
| user_ai_budget_exceeded | "Seu orçamento mensal de IA foi atingido. Fale com o administrador ou aguarde o próximo mês." | Banner |
| active_series_limit | "Você já tem o número máximo de séries ativas. Conclua ou cancele uma para criar outra." | Banner no wizard, link para lista |
| bible_version_conflict | "A bíblia foi alterada em outro lugar. Recarregue para ver a versão atual; suas edições não foram salvas." | Banner + "Recarregar" |
| script_revision_conflict | "O roteiro mudou enquanto você editava. Recarregue para continuar; suas edições não foram salvas." | Banner + "Recarregar" |
| episode_busy | "O episódio está sendo processado. Aguarde terminar para fazer alterações." | Toast |

Outros HTTP: 404 canal/série "não encontrado"; 413 "Imagem maior que 5 MB."; 415 "Formato não aceito. Use PNG, JPEG ou WebP."; 422 mostra o campo (`formatApiErrorDetail` já existente) e, em atestação ausente, "Marque a declaração de originalidade"; 422 de premissa recusada (triagem da IA, via `error` da série em `plan_failed`) mostra os motivos: ip_infringement "Parece copiar uma obra, personagem ou universo protegido", real_person "Envolve uma pessoa real", unsafe "Conteúdo não permitido", too_vague "Premissa vaga demais; detalhe conflito e personagens".

Tratar `409 detail` como objeto `{code,message}` exige estender `ApiError` (ver seção 11).

## 9. Polling (`usePolling`)

- **Só em estados transitórios.** Série: `planning`. Episódio: `scripting`, `validating`, `generating_media`, `assembling` (e `script_ready` por curto tempo, pois avança sozinho). Lista de séries: só se alguma série está `planning`. Aba Episódios/Visão geral: só se algum episódio está transitório.
- Estados estáveis (`awaiting_*`, `pending_review`, `scheduled`, `published`, `planned`, `plan_failed`, `paused`, `completed`, `canceled`, `needs_attention`, `approved`, `rejected`, `stale`): **sem polling**; revalida ao voltar o foco da aba (`visibilitychange`) e após cada mutação.
- Intervalo: 5 s inicial, +50% até 20 s; reseta ao mudar o status. Para quando `document.hidden`; cancela no desmonte; aborta via `AbortController`. Para após 5 min contínuos no mesmo estado com botão "Atualizar" manual e aviso "A atualização automática pausou".
- Atualização de estado anunciada em região `aria-live="polite"` visualmente oculta ("Episódio 7: roteiro pronto para aprovação"), sem mover o foco.
- Jobs de mídia seguem o polling do episódio (`GET .../episodes/{n}`), não polling por job.

## 10. Acessibilidade e responsividade

- Foco visível padrão do projeto (`focus-visible:outline-2 outline-indigo-500`) em todos os alvos. Alvos de toque ≥ 44 px em mobile.
- Wizard: cada passo recebe foco no `h2` ao montar; erros em lista `role="alert"` no topo com links para os campos; rádios de estratégia via `radiogroup` com navegação por setas.
- Abas: padrão WAI-ARIA tabs (seção 5). Drawer e `Dialog`: trap de foco, Esc, foco devolvido, `aria-modal`, `aria-labelledby`.
- Linha do tempo e grade são listas semânticas (`ol`/`ul`); status em texto + símbolo.
- Contraste: usar os pares já em `Badge` (900 sobre 50 / 200 sobre 950). Barras de progresso levam valor textual vizinho.
- `prefers-reduced-motion`: spinners estáticos, sem `transition` de largura nas barras.
- Mídia: `thumbnail` com `loading="lazy"`; **`<video>` só monta quando o drawer está aberto** e com `preload="metadata"`; nunca em listas. Preview de voz: um `<audio>` por vez, criado sob demanda.
- Breakpoints: base 1 coluna; `sm` grade de episódios 3 col; `md` sidebar fixa (já existe), drawer vira painel lateral, tabelas; `lg` colunas laterais na Visão geral e player ao lado dos jobs. Testar em 360 px: nenhum scroll horizontal exceto a lista de abas e a linha do tempo horizontal (que em mobile é vertical).

## 11. Componentes

Criar (`apps/web/src/components/series/`, tipos/chamadas em `src/lib/series.ts` espelhando o contrato, no padrão de `lib/clips.ts`):

- `SeriesManager` (lista), `SeriesCard`, `EpisodeProgressBar`
- `SeriesWizard`, `WizardStepper`, `PremiseField` (textarea + contador), `VisualStrategyPicker`, `CostEstimate` (cálculo + bloco "Como calculamos"), `ProviderSelect`, `VoicePicker` (+ preview), `OriginalityAttestation`
- `SeriesDetail` (cabeçalho, ações, abas), `SeriesTabs`, `SeriesActionDialogs` (iniciar/cancelar/excluir/replanejar), `SeriesSettingsDialog`
- `SeriesOverviewTab`, `NextActionCard`, `AgendaTimeline`, `SeriesStatusBadge`, `PauseReasonNotice`
- `BibleTab`, `BibleWorldSection`, `BibleStyleSection`, `CharacterCard`, `CharacterEditDialog`, `ReferenceImageUploader`, `CharacterStatusBadge`, `CharacterEventTimeline`
- `EpisodesTab`, `EpisodeGrid`, `EpisodeList`, `EpisodeStatusBadge`, `ArcPhaseChip`
- `EpisodeDrawer`, `EpisodeStepper`, `EpisodeActionBar`, `OutlineView`, `ScriptEditor`, `SceneCard`, `ValidationReport`, `RegenerateDialog`, `RejectDialog`, `UnapproveDialog`, `MediaJobsTable`, `EpisodeVideoPlayer`
- `CostsTab`, `CostBreakdown`, `CostEventsTable`
- Hooks: `usePolling`, `useSeries`, `useEpisode`, `useProviders`.
- Mapa de erros: `lib/series-errors.ts` (seção 8).

Reaproveitar sem mudança: `Badge`/`makeStatusBadge`, `EmptyState`, `Skeleton`/`SkeletonList`, `UsageBar`, `useToast`, `ChannelColorDot`, `PublicationStatusBadge`, `useOwnerLabel`/`useShowOwnerColumn`, `ApiError`/`formatApiErrorDetail`, `channel-context`.

Estender:
- `Dialog`: prop `variant?: "center" | "drawer"` (drawer lateral/tela cheia mobile, mesmo foco/Esc/backdrop).
- `lib/api.ts`: `ApiError` expõe `code?: string` quando `detail` é `{code,message}` (hoje `formatApiErrorDetail` trata só string/lista de 422).
- `lib/nav.ts`: grupo "Séries IA". `lib/clips.ts`: campos novos de `ClipRead` (`episode_id`, `series_id`, `episode_number`, `synthetic_media`; `job_id`/`media_asset_id` nullable). Cuidar de `ClipCard`/`ClipDetailDialog`/Revisão: clipe de episódio mostra "Série X · Ep. N", selo "IA", esconde start/end e o ajuste de trecho, e aprovar/rejeitar ali chama o lifecycle do episódio (o backend delega). `PublicationRead.synthetic_media` ganha selo "IA".

## 12. Para confirmar com o dono antes de implementar

1. Constantes da estimativa local (4 cenas, 450 caracteres, LLM ≈ US$ 0,15/ep.): preferível o backend devolver estimativa por estratégia em `GET /api/series/providers` ou um endpoint de cotação para o wizard; hoje o `estimated_cost` só existe depois de criar a série.
2. `max_video_scenes_per_episode` e `privacy` são editáveis depois? Esta spec assume sim (PATCH), conforme o contrato.
3. Aprovar roteiro e vídeo sem modal de confirmação (decisão desta spec, para velocidade diária). Confirmar se o dono prefere confirmar o gasto na aprovação do roteiro.
4. Ação "cancelar geração de mídia" não existe no contrato; a UI não a oferece.
5. Rótulo de IA nas plataformas depende dos publishers (stub): a UI mostra o selo "IA" e o texto da atestação, mas não prometer publicação automática até o OAuth existir; mostrar episódios `exported` (contas manuais) com link de exportação.
6. Há dependência do backend: expor o `GET .../reference-image` com `Cache-Control` privado e o campo `has_reference_image` (já no contrato).
