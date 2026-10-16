// Conteúdo do manual. Cada item é uma página A4. Todo número/regra citado foi conferido no código (ver docs/manual/README.md).
const { fig, why, how, warn, screen, partCover, callout } = require('./build-lib.js');
const pill = (c, t) => `<span class="pill ${c}">${t}</span>`;
const flow = (arr) => `<div class="flow">${arr.map((x, i) => (i ? '<span class="arrow"></span>' : '') + x).join('')}</div>`;
const pages = [];
const add = (p) => pages.push(p);

/* ================= CAPA ================= */
add({ cover: 'main', html: `
  <div class="brand"><i></i>Projetos Cortes</div>
  <h1>Manual de Uso</h1>
  <div class="sub">Projetos Cortes</div>
  <p class="sum">Do vídeo original ao corte vertical pronto, e de uma ideia a uma série de 20 episódios feita com IA — sempre com a trava de direitos autorais ligada e a sua aprovação em cada etapa.</p>
  <div class="comp">
    <div class="desk"><div class="bar"><i></i><i></i><i></i></div><img src="img/a-visao.png"></div>
    <div class="phone"><img src="img/m-revisao.png"></div>
  </div>
  <div class="ver"><span>Versão 1.0 · Outubro de 2026</span><span>Guia para criadores de conteúdo</span></div>` });

/* ================= SUMÁRIO ================= */
add({ part: 'X', html: `<p class="tag">Navegação</p><h1>Sumário</h1><p class="intro">Encontre a tela ou o assunto que você procura. Os números levam às páginas deste manual.</p><div class="toc">{{TOC}}</div>` });

/* ================= APRESENTAÇÃO ================= */
add({ part: 'X', toc: { level: 2, label: 'Apresentação: o que é a plataforma' }, html: `
  <p class="tag">Apresentação</p><h1>O que é a plataforma</h1>
  <p class="intro">O <b>Projetos Cortes</b> ajuda você a criar vídeos verticais (Shorts, Reels, TikTok) a partir de material que você tem o direito de usar — próprio, licenciado, de domínio público ou Creative Commons — e a criar séries de histórias com inteligência artificial. Você decide tudo; a plataforma organiza o trabalho.</p>
  <div class="pcards">
    <div class="pcard" style="background:linear-gradient(135deg,#4338ca,#6366f1)"><div class="ic">A</div><div><h3>Cortes</h3><p>Envie um vídeo, deixe o sistema sugerir os melhores momentos, revise e prepare a publicação.</p>
      <div class="steps"><em>Upload</em><span class="arrow"></span><em>Análise</em><span class="arrow"></span><em>Revisão</em><span class="arrow"></span><em>Publicação</em></div></div></div>
    <div class="pdown"></div>
    <div class="pcard" style="background:linear-gradient(135deg,#6d28d9,#a855f7)"><div class="ic">B</div><div><h3>Séries IA</h3><p>Descreva uma ideia; a IA planeja 20 episódios de cerca de 30 segundos. Você aprova o roteiro e o vídeo de cada episódio.</p>
      <div class="steps"><em>Ideia</em><span class="arrow"></span><em>Plano</em><span class="arrow"></span><em>Roteiro</em><span class="arrow"></span><em>Vídeo</em><span class="arrow"></span><em>Agenda</em></div></div></div>
    <div class="pdown"></div>
    <div class="pcard" style="background:linear-gradient(135deg,#0369a1,#0ea5e9)"><div class="ic">C</div><div><h3>Administração e conta</h3><p>Usuários, cotas de uso, “ver como” outro usuário, auditoria e preferências da sua conta.</p>
      <div class="steps"><em>Usuários</em><span class="arrow"></span><em>Cotas</em><span class="arrow"></span><em>Auditoria</em></div></div></div>
    <div class="pdown"></div>
    <div class="pcard" style="background:linear-gradient(135deg,#047857,#10b981)"><div class="ic">D</div><div><h3>Trava de direitos (rights gate)</h3><p>Funciona por baixo de tudo: nenhum corte entra na fila de publicação sem licença válida registrada.</p></div></div>
  </div>
  <p class="small muted"><b>Plataformas de destino:</b> YouTube Shorts, TikTok, Instagram Reels, Facebook Reels, Vimeo e Bilibili (esta última só por exportação manual). Hoje a publicação acontece por <b>exportação de pacote</b> (arquivo zip com o vídeo e os textos); a publicação automática nas plataformas depende de conectar as contas, o que ainda está em desenvolvimento.</p>
  ${warn('<p>As telas deste manual são de um <b>ambiente de demonstração, com dados fictícios</b>: nomes, canais, vídeos sintéticos gerados só para exemplo e provedores de IA de teste. Os valores e textos que você verá no seu painel serão diferentes.</p>')}` });

add({ part: 'X', toc: { level: 2, label: 'Como ler este manual' }, html: `
  <p class="tag">Apresentação</p><h1>Como ler este manual</h1>
  <p class="intro">Cada tela do painel aparece em uma imagem real, com marcações numeradas. Os números da imagem correspondem à legenda logo abaixo dela.</p>
  <h2>Marcações numeradas</h2>
  <div class="row2" style="align-items:center;margin-bottom:3mm">
    <div class="fig" style="aspect-ratio:2/1;width:100%"><div class="in" style="left:0;top:0;width:100%;height:100%;background:#fff;padding:5mm;font-size:9pt"><div style="border:1px solid var(--border);border-radius:6px;padding:3mm;width:70%;color:var(--fg-muted)">Botão ou campo da tela</div></div><i class="box" style="left:6%;top:14%;width:74%;height:58%"></i><b class="num" style="left:6%;top:14%">1</b></div>
    <ol class="legend c1"><li><span class="n">1</span><div><b>Nome do elemento</b> <span class="d">— um contorno azul e um círculo numerado marcam o botão, campo ou área na tela. A descrição curta explica para que serve e o que fazer.</span></div></li></ol>
  </div>
  <h2>Os três tipos de caixa</h2>
  ${why('<p>Explica a razão de uma regra ou de um comportamento — útil para entender o que parece estranho, como um bloqueio ou um limite.</p>')}
  ${how('<p>Descreve, passo a passo, o que o sistema faz por trás da tela ou como usar um recurso do jeito certo.</p>')}
  ${warn('<p>Chama atenção para algo que pode causar problema: direitos autorais, limites de uso, funções ainda indisponíveis.</p>')}
  <h2>Outras convenções</h2>
  <ul class="tight">
    <li><b>Rótulo da seção</b> em letras maiúsculas coloridas, no alto de cada página (por exemplo, <i>A8 · REVISÃO</i>): letra da parte e número da seção.</li>
    <li><b>Negrito</b> indica o nome exato de botões, abas e menus como aparecem na tela.</li>
    <li><kbd>Ctrl</kbd> + <kbd>K</kbd> indica teclas pressionadas juntas.</li>
    <li>Selos ${pill('admin', 'ADMIN')} e ${pill('user', 'USUÁRIO')} mostram quem pode usar cada recurso.</li>
  </ul>` });

add({ part: 'X', toc: { level: 2, label: 'Quem faz o quê' }, html: `
  <p class="tag">Apresentação</p><h1>Quem faz o quê</h1>
  <p class="intro">A plataforma tem dois perfis. O administrador cuida da casa; cada usuário trabalha nos próprios canais e vídeos.</p>
  <table class="t">
    <tr><th style="width:22%">Perfil</th><th>O que faz</th><th style="width:26%">Onde atua</th></tr>
    <tr><td>${pill('admin', 'ADMIN')}<br><span class="small muted">Dono da plataforma</span></td>
      <td><ul class="tight"><li>Cria usuários, define cotas e redefine senhas.</li><li>Cadastra as <b>chaves das integrações</b> (YouTube, TikTok, IA etc.).</li><li>Enxerga os dados de <b>todos</b> e pode “ver como” um usuário.</li><li>Não tem cotas (armazenamento, análises e canais ilimitados).</li><li>Também faz tudo o que o usuário faz.</li></ul></td>
      <td>Usuários · Contas (Configurar chaves) · Ver como · Auditoria</td></tr>
    <tr><td>${pill('user', 'USUÁRIO')}<br><span class="small muted">Criador de conteúdo</span></td>
      <td><ul class="tight"><li>Cria canais, cadastra fontes e licenças.</li><li>Envia vídeos, analisa, revisa, aprova e publica cortes.</li><li>Cria séries com IA e aprova roteiros e vídeos.</li><li>Vê <b>somente</b> os próprios dados.</li><li>Segue as cotas definidas pelo administrador.</li></ul></td>
      <td>Visão geral · Upload · Jobs · Revisão · Publicações · Agenda · Séries IA · Canais · Fontes · Contas · Minha conta</td></tr>
  </table>
  <h2>E a inteligência artificial?</h2>
  <p>A IA <b>propõe</b>: sugere cortes, escreve títulos, planeja e roteiriza séries, gera imagens, vozes e vídeo. <b>Quem decide é você</b>: nada vai para a fila de publicação sem a sua aprovação e sem passar pela trava de direitos.</p>
  ${how('<p>Se você não vê o item <b>Usuários</b> no menu lateral, seu perfil é de usuário comum. Para pedir mais cota, redefinir a senha ou cadastrar uma chave de integração, fale com o administrador.</p>')}` });

/* ================= PARTE A ================= */
add(partCover('A', 'Do vídeo enviado ao corte aprovado e pronto para publicar, passando pela trava de direitos.', [
  ['Entrar e visão geral', ''], ['Canais', ''], ['Fontes & Licenças', ''], ['Como descobrir a licença de um vídeo', ''], ['Upload', ''], ['Analisar', ''], ['Jobs', ''], ['Revisão', ''], ['Publicar e a trava de direitos', ''], ['Publicações', ''], ['Agenda', ''], ['Contas e integrações', ''],
]));
pages[pages.length - 1].toc = { level: 1, label: 'Parte A · Cortes' };

// A1 Entrar
add(screen({ part: 'A', tag: 'A1 · ENTRAR', title: 'Entrar na plataforma', intro: 'O acesso é por usuário e senha, criados pelo administrador. Não existe cadastro aberto.',
  body: `${fig('a-login', [['Usuário', 'o nome de usuário que o administrador criou para você.'], ['Senha', 'mínimo de 10 caracteres.'], ['Entrar', 'abre a Visão geral.']], { crop: [330, 640, 430, 1010], width: '135mm', cols: 1 })}
  <div class="row2" style="margin-top:3mm"><div>
  ${how('<ul><li>O administrador cria o seu usuário e informa uma senha provisória.</li><li>Se ele marcou <b>Exigir troca de senha no 1º login</b>, você é levado direto à tela <b>Minha conta</b> para escolher uma senha nova antes de usar o resto.</li><li>A sessão fica ativa por <b>7 dias</b>; depois disso é preciso entrar de novo.</li></ul>')}
  ${why('<p>Por segurança, após <b>5 tentativas erradas em 15 minutos</b> (para o mesmo usuário, a partir do mesmo computador) o acesso é bloqueado por um tempo. A mensagem de erro é genérica de propósito: ela não diz se o usuário existe.</p>')}</div><div>
  ${warn('<p>Não há botão “Esqueci minha senha”. Se perder a senha, peça ao administrador para <b>redefinir</b>: ele define uma senha provisória e você troca no próximo acesso.</p>')}
  <h3>Menu do usuário</h3><p class="small">Clicando no seu nome, no canto inferior esquerdo, abre-se o menu com <b>Minha conta</b>, o seletor <b>Ver como</b> (somente admin), a troca de <b>tema claro/escuro</b> e <b>Sair</b>. Veja a Parte C.</p></div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A1 · Entrar' };

// A2 Visão geral
add(screen({ part: 'A', tag: 'A2 · VISÃO GERAL', title: 'Visão geral: o que precisa de você agora', intro: 'A primeira tela mostra o que está esperando a sua decisão e como está o funil de cortes.',
  body: `${fig('a-visao', [
    ['Precisa da sua atenção', 'atalhos para cortes aguardando revisão e, se houver séries, episódios aguardando aprovação de roteiro ou de vídeo. Cada cartão leva direto à tela certa.'],
    ['Números do funil', 'Aguardando revisão, Jobs ativos, Agendadas e Publicadas. Clique para abrir a tela correspondente.'],
    ['Próximos agendamentos', 'as próximas publicações agendadas (vazio quando nada está agendado).'],
    ['Jobs em andamento', 'análises de vídeo em execução; <b>Ver todos</b> abre a tela Jobs.'],
    ['Cortes e Publicações por status', 'barras com a contagem de cada situação.'],
    ['Seletor de canal', 'filtra as telas por um canal; “Todos os canais” mostra tudo.'],
    ['Atalhos de topo', '<b>Enviar vídeo</b> abre o Upload; <b>Revisar cortes</b> abre a Revisão (o número é a fila).'],
    ['Menu lateral', 'organizado na ordem do trabalho: Produzir, Séries IA, Biblioteca &amp; configuração e (admin) Administração. A bolinha com número indica itens esperando você.'],
  ])}
  ${how('<p>A tela se atualiza sozinha enquanto há análises rodando. O botão ao lado do logotipo recolhe o menu lateral (veja <b>C5</b>), e <kbd>Ctrl</kbd> + <kbd>K</kbd> abre a busca de telas.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'A2 · Visão geral' };

// A3 Canais
add(screen({ part: 'A', tag: 'A3 · CANAIS', title: 'Canais: um por nicho', intro: 'Um canal reúne contas de publicação, o preset padrão de análise e o modelo de texto de um nicho (por exemplo, “Ação em 60s”).',
  body: `${fig('a-canais', [['Novo canal', 'abre o formulário de criação.'], ['Cartão do canal', 'nome, cor, nicho, preset padrão e dono.'], ['Contas conectadas', 'selos YT, TT, BL, IG, FB e VM. Os verdes são plataformas que já têm conta neste canal — cada canal pode ter <b>uma conta por plataforma</b>.'], ['Contadores', 'cortes <b>Em revisão</b>, <b>Agendados</b> e <b>Publicados</b> do canal.'], ['Ações', '<b>Editar</b>, <b>Contas</b> e o menu de mais opções.']], { crop: [0, 520] })}
  <div class="row2"><div>${why('<p>Canais separam nichos diferentes sob o mesmo login. Cada um guarda seus próprios padrões, e você pode filtrar qualquer tela por canal com o seletor da barra lateral.</p>')}</div>
  <div>${warn('<p>Você só pode ter um número limitado de canais (padrão: <b>4</b> para usuários comuns; o administrador define a cota). Excluir um canal é bloqueado enquanto houver publicações agendadas nele.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A3 · Canais' };

add(screen({ part: 'A', tag: 'A3 · CANAIS', title: 'Criando um canal', intro: 'O formulário define a identidade do canal e os padrões que serão usados nas análises e nos textos.',
  body: `${fig('a-canal-novo', [['Nome e slug', 'o slug é o identificador curto do canal (único entre os seus canais).'], ['Nicho e cor', 'texto livre; a cor aparece em cartões, agenda e seletor.'], ['Preset padrão', 'usado nas análises quando você não escolhe outro.'], ['Pesos por sinal', 'Áudio, Cenas, Movimento, Fala e LLM (IA). Ao escolher um preset, os pesos são preenchidos e você pode ajustá-los.'], ['Parâmetros de análise', 'duração mínima e máxima, máximo de cortes, idioma, reenquadramento e legendas queimadas.'], ['Template de publicação', 'idioma do texto, tom, limite de título, hashtags fixas e texto extra de descrição.']], { crop: [100, 1250], width: '150mm' })}` }));

// A4 Fontes
add(screen({ part: 'A', tag: 'A4 · FONTES & LICENÇAS', title: 'Fontes & Licenças', intro: 'Toda mídia precisa estar ligada a uma <b>Fonte</b>: o registro que diz de onde veio o vídeo e com que licença você pode usá-lo.',
  body: `${fig('a-fontes', [['Nova fonte', 'abre o formulário (próxima página).'], ['Aviso de licenciamento', 'nenhum corte é publicado sem licença válida verificada; dublagens e trilhas podem ter direitos próprios; CC-NC e CC-ND são bloqueadas para monetização.'], ['CC BY', 'permite cortes, inclusive monetizados, com atribuição obrigatória.'], ['CC BY-NC', 'selo “bloqueado para monetização”: não vale para contas monetizadas.'], ['CC BY-ND', 'selo “bloqueado: não permite derivados”: cortes são obra derivada e são <b>sempre</b> bloqueados.'], ['Domínio público', 'sem restrição de licença (a validade e as plataformas permitidas ainda são conferidas).']], { crop: [0, 740] })}
  <div class="row2"><div>${why('<p>Um corte é uma <b>obra derivada</b> do vídeo original. Por isso licenças que proíbem derivações (ND) nunca liberam publicação, e licenças não comerciais (NC) não liberam contas que monetizam.</p>')}</div>
  <div>${how('<p>Cada série de IA cria sozinha uma fonte “Gerado por IA” (você a vê na lista como <b>Série IA</b>). Ela não pode ser excluída nem ter a licença alterada enquanto a série existir.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A4 · Fontes & Licenças' };

add(screen({ part: 'A', tag: 'A4 · FONTES & LICENÇAS', title: 'Cadastrando uma fonte', intro: 'Preencha com o que a página de origem do vídeo declara. Quanto mais completo, menos bloqueios surpresa na hora de publicar.',
  body: `${fig('a-fonte-form', [['Título e nome da obra', 'como você quer identificar a fonte e o nome da obra original.'], ['Tipo de licença', 'Domínio público, CC BY, CC BY-SA, CC BY-NC, CC BY-ND, Licenciado ou Conteúdo próprio.'], ['URL de comprovação', 'link da página onde a licença está declarada. Guarde como prova.'], ['Validade', 'início e fim da licença. Fora desse período a publicação é bloqueada.'], ['Territórios', 'códigos dos países onde a licença vale (ex.: BR, US). Fica registrado na fonte.'], ['Plataformas permitidas', 'só nelas a publicação é liberada.'], ['Monetização permitida', 'marque só se a licença permitir. Sem isso, contas monetizadas são bloqueadas.'], ['Texto de atribuição', 'entra automaticamente na descrição de toda publicação. É obrigatório para CC BY e CC BY-SA.'], ['Criar fonte', 'salva o registro.']], { crop: [250, 1000], width: '160mm' })}` }));

// A4c Como descobrir a licença
add(screen({ part: 'A', tag: 'A4 · FONTES & LICENÇAS', title: 'Como descobrir a licença de um vídeo', intro: 'Antes de enviar qualquer vídeo, confirme que você pode cortá-lo e republicá-lo. Este guia não substitui orientação jurídica.',
  body: `${warn('<p><b>Regra de ouro:</b> vídeo sem licença declarada é vídeo com <b>todos os direitos reservados</b>. Estar online, ser “público” ou ter pouca duração não dá permissão. <b>Não existe “duração segura”</b>: cortar 5, 10 ou 30 segundos sem licença não torna o uso legal.</p>')}
  <div class="row2"><div>
  <h3>No YouTube</h3><p class="small">Abra o vídeo, expanda a descrição (<b>…mais</b>) e procure a linha <b>Licença</b>. “Licença padrão do YouTube” significa todos os direitos reservados. “Creative Commons — Atribuição” (CC BY) permite reutilizar com crédito. Só o autor original pode marcar essa licença.</p>
  <h3>No Internet Archive</h3><p class="small">Na página do item, procure o campo de <b>licença</b> (por exemplo, “Public Domain” ou uma licença Creative Commons). Se a licença não estiver especificada, <b>isso não é permissão</b>.</p>
  <h3>Reupload não vale</h3><p class="small">Um vídeo marcado como livre em um canal que apenas <b>copiou</b> o original não prova nada. Volte à fonte original e confira ali a licença e o autor.</p></div><div>
  <h3>Domínio público no Brasil</h3><p class="small">Pela Lei 9.610/1998, art. 44, a proteção das obras audiovisuais dura <b>70 anos</b>, contados de 1º de janeiro do ano seguinte ao da divulgação. Passado esse prazo, a obra está em domínio público.</p>
  <h3>Domínio público nos EUA</h3><p class="small">Em regra, obras publicadas há mais de <b>95 anos</b> (em 2026, as publicadas até 1930). Confira a data de <b>publicação</b> da obra, não a do arquivo digital.</p>
  <h3>Cuidado com versões</h3><p class="small">A <b>obra</b> pode ser livre, mas uma restauração, uma <b>trilha sonora</b> ou uma <b>dublagem</b> específica pode ter direitos próprios e exigir licença separada.</p></div></div>
  ${how('<ol class="tight"><li>Encontre a licença na <b>página original</b> (não em cópias).</li><li>Copie o link para o campo <b>URL de comprovação</b> da Fonte e anote o texto de atribuição exigido.</li><li>Marque só as plataformas e a monetização que a licença permite.</li><li>Na dúvida, <b>não publique</b>. A responsabilidade legal pelo conteúdo é sua.</li></ol>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'A4 · Como descobrir a licença de um vídeo' };

// A5 Upload
add(screen({ part: 'A', tag: 'A5 · UPLOAD', title: 'Upload de vídeos', intro: 'Envie o vídeo-fonte (e legendas) que servirá de base para os cortes verticais. O envio só começa depois que você escolhe uma fonte.',
  body: `${fig('a-upload', [['Fonte', 'obrigatória: escolha a licença a que o vídeo pertence.'], ['Canal (opcional)', 'por padrão vale o canal da barra lateral ou o canal padrão da fonte.'], ['Aviso', 'só envie conteúdo cuja licença cubra o uso pretendido.'], ['Área de envio', 'arraste os arquivos ou use <b>Escolher arquivos</b>. Formatos: .mp4, .mkv, .mov e .srt.'], ['Uploads recebidos', 'arquivo, fonte, canal, dono, status e data.'], ['Analisar', 'abre as opções de análise (próxima seção).'], ['Ver vídeo', 'reproduz o arquivo enviado.']], { crop: [0, 1000], width: '165mm' })}
  <div class="row3">${how('<p>O envio é <b>retomável</b>: o arquivo sobe em partes de <b>50 MB</b>. Se a conexão cair, ele tenta de novo sozinho (até 5 tentativas) e continua de onde parou.</p>')}
  ${why('<p>Sem fonte não há envio. Assim, nenhum vídeo existe na plataforma sem uma licença registrada.</p>')}
  ${warn('<p>Há uma cota de armazenamento (padrão <b>50 GB</b> por usuário; admin ilimitado). Acima dela, o envio é recusado.</p>')}</div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A5 · Upload' };

// A6 Analisar
add(screen({ part: 'A', tag: 'A6 · ANALISAR', title: 'Analisar: presets e parâmetros', intro: 'A análise procura os trechos mais intensos do vídeo e propõe cortes verticais de 1080×1920.',
  body: `${fig('a-analisar', [['Canal', 'define os padrões herdados (preset e parâmetros).'], ['Preset', 'Ação, Drama, Comédia, Suspense ou Personalizado.'], ['Duração mínima e máxima (s)', 'padrão do sistema: <b>15 a 60 s</b>.'], ['Máximo de cortes', 'padrão do sistema: <b>6</b> por análise.'], ['Idioma', 'idioma da fala, para a transcrição e as legendas (padrão pt-BR).'], ['Reenquadramento', 'como o vídeo horizontal vira vertical: automático, com fundo desfocado ou centralizado.'], ['Queimar legendas', 'grava as legendas dentro do vídeo.'], ['Iniciar análise', 'cria o job e leva você ao acompanhamento.']], { crop: [140, 760], width: '125mm' })}
  <div class="row2"><div>
  <table class="t compact"><tr><th>Preset</th><th>Áudio</th><th>Cenas</th><th>Mov.</th><th>Fala</th><th>IA</th></tr>
  <tr><td>Ação</td><td>0,30</td><td>0,25</td><td>0,35</td><td>0,05</td><td>0,05</td></tr>
  <tr><td>Drama</td><td>0,15</td><td>0,10</td><td>0,05</td><td>0,40</td><td>0,30</td></tr>
  <tr><td>Comédia</td><td>0,20</td><td>0,15</td><td>0,15</td><td>0,30</td><td>0,20</td></tr>
  <tr><td>Suspense</td><td>0,25</td><td>0,20</td><td>0,20</td><td>0,20</td><td>0,15</td></tr>
  <tr><td>Personalizado</td><td colspan="5">você define os pesos</td></tr></table></div>
  <div>${how('<p>O sistema mede cinco sinais em cada trecho — <b>áudio</b>, <b>cortes de cena</b>, <b>movimento</b>, <b>fala</b> e (se houver chave) refinamento por <b>IA</b> — e soma com os pesos do preset. Depois escolhe até N trechos sem sobreposição, dentro da duração pedida.</p>')}
  ${why('<p>Cada gênero pede um olhar diferente: ação valoriza movimento; drama valoriza fala e emoção.</p>')}</div></div>
  ${warn('<p>Existe um limite de análises por dia (padrão <b>10</b> para usuários comuns; o administrador não tem limite). A contagem usa o horário de Brasília.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'A6 · Analisar (presets e parâmetros)' };

// A7 Jobs
add(screen({ part: 'A', tag: 'A7 · JOBS', title: 'Jobs: acompanhando as análises', intro: 'Cada análise iniciada vira um job. Aqui você vê a fila e o andamento de cada um.',
  body: `${fig('a-jobs', [['Filtro de status', 'mostra só jobs na fila, processando, concluídos, com falha ou cancelados.'], ['Processando', 'selo do estado atual do job.'], ['Cartão do job', 'preset usado, dono, estágio atual, barra de progresso e horário de criação.'], ['Concluído', 'o job terminou e os cortes foram gerados.'], ['Ver cortes', 'abre a Revisão para avaliar os cortes gerados.']], { crop: [0, 700] })}
  <div class="row2"><div>${how(`<p>Estados de um job: ${pill('neutral','Na fila')} ${'<span class="arrow" style="display:inline-block;vertical-align:middle"></span>'}${pill('info','Processando')} → ${pill('ok','Concluído')}. Também pode terminar como ${pill('bad','Falhou')} ou ${pill('neutral','Cancelado')}. Enquanto está na fila ou processando há um botão <b>Cancelar</b>.</p>`)}</div>
  <div>${why('<p>Gerar cortes envolve transcrever a fala, detectar cenas e renderizar vídeo, o que leva tempo. O job roda em segundo plano para você continuar usando o painel.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A7 · Jobs' };

// A8 Revisão
add(screen({ part: 'A', tag: 'A8 · REVISÃO', title: 'Revisão: aprovar ou rejeitar', intro: 'Os cortes sugeridos chegam aqui. Veja cada um, ajuste se quiser e decida. Nada segue para publicação sem a sua aprovação.',
  body: `${fig('a-revisao', [['Filtro de status', 'Aguardando revisão (padrão), Aprovado, Rejeitado e outros.'], ['Atalhos de teclado', 'o botão de ajuda lista as teclas.'], ['Corte em foco', 'o contorno roxo mostra qual corte as teclas controlam.'], ['Duração', 'tamanho do corte em segundos.'], ['Score', 'nota de intensidade do trecho; as barrinhas mostram o peso de cada sinal.'], ['Aprovar / Rejeitar', 'decide na hora e mostra o aviso <b>Desfazer</b>.'], ['Ver detalhes', 'abre o corte para assistir, editar textos e ajustar o recorte.'], ['Selecionar', 'marque vários cortes para agir em lote.']], { crop: [0, 900], width: '150mm' })}
  <div class="row2"><div><table class="t compact"><tr><th style="width:18%">Tecla</th><th>Ação</th></tr><tr><td><kbd>J</kbd></td><td>Próximo corte</td></tr><tr><td><kbd>K</kbd></td><td>Corte anterior</td></tr><tr><td><kbd>A</kbd></td><td>Aprovar o corte em foco (com Desfazer)</td></tr><tr><td><kbd>R</kbd></td><td>Rejeitar o corte em foco (com Desfazer)</td></tr><tr><td><kbd>Ctrl</kbd> <kbd>K</kbd></td><td>Buscar tela</td></tr></table></div>
  <div>${how('<p><b>Desfazer:</b> ao aprovar ou rejeitar aparece um aviso por alguns segundos. A decisão só é enviada ao sistema depois de cerca de <b>6 segundos</b>; clique em <b>Desfazer</b> dentro desse prazo para voltar atrás.</p>')}${warn('<p>Cortes de <b>episódios de série</b> (selos “Série · Ep.” e “IA”) também aparecem aqui. Aprovar ou rejeitar executa a ação no episódio e o recorte não pode ser ajustado.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A8 · Revisão (atalhos J/K/A/R e desfazer)' };

add(screen({ part: 'A', tag: 'A8 · REVISÃO', title: 'Revisão: ações em lote e detalhe do corte', intro: 'Marque vários cortes para decidir de uma vez. Abra um corte para ajustar texto por plataforma e o recorte.',
  body: `${fig('a-revisao-lote', [['Contagem', 'quantos cortes estão selecionados.'], ['Aprovar / Rejeitar', 'aplica a decisão a todos os selecionados.'], ['Publicar (n)', 'abre a janela de publicação para os selecionados (precisam estar aprovados).'], ['Limpar seleção', 'desmarca todos.']], { crop: [95, 250], cols: 2 })}
  ${fig('a-corte', [['Player', 'assista ao corte vertical.'], ['Abas por plataforma', 'YouTube Shorts, TikTok, Bilibili, Instagram Reels, Facebook Reels e Vimeo: cada uma com seus textos.'], ['Título', 'com contador de caracteres.'], ['Descrição', 'a atribuição da licença é incluída ao exportar ou publicar.'], ['Hashtags', 'separadas por vírgula.'], ['Salvar e regenerar', '<b>Salvar</b> grava a edição; <b>Regenerar</b> pede novos textos (esta plataforma ou todas).'], ['Ajuste fino', 'início e fim em segundos, com passos de 0,5 s. <b>Salvar recorte</b> re-renderiza o vídeo.'], ['Aprovar (A) / Rejeitar (R)', 'decisão final do corte.']], { crop: [60, 990], width: '138mm' })}
  <div class="row2"><div>${warn('<p>Sem chave de IA configurada, os títulos e hashtags são simples e automáticos. Revise e melhore antes de aprovar.</p>')}</div><div>${how('<p>Para ajustar o recorte, mude início e fim e clique em <b>Salvar recorte</b>. O corte volta a “Renderizando” e depois reaparece para revisão.</p>')}</div></div>` }));

// A9 Publicar
add(screen({ part: 'A', tag: 'A9 · PUBLICAR', title: 'Publicar e a trava de direitos', intro: 'Depois de aprovar, selecione os cortes e clique em <b>Publicar</b>. A trava de direitos confere cada combinação de corte e conta antes de qualquer coisa.',
  body: `${fig('a-publicar', [['Destino', '“Todas as contas do canal de cada corte” ou “Contas específicas”.'], ['Agendamento', 'automático (próximo horário livre), agora ou uma data e hora escolhidas.'], ['Privacidade', 'padrão da conta/plataforma, ou uma opção específica.'], ['Publicar', 'confere a trava e cria as publicações.']], { crop: [300, 800, 330, 1110], width: '120mm', cols: 2 })}
  <h2>O que a trava de direitos bloqueia</h2>
  <table class="t compact"><tr><th style="width:34%">Motivo mostrado</th><th>Quando acontece</th></tr>
  <tr><td>Fonte sem licença cadastrada</td><td>O vídeo não tem fonte vinculada ou a fonte está sem tipo de licença.</td></tr>
  <tr><td>Fora da janela de validade</td><td>A data de hoje está antes do início ou depois do fim da validade da licença.</td></tr>
  <tr><td>Plataforma não permitida</td><td>A plataforma da conta não está entre as permitidas na fonte.</td></tr>
  <tr><td>CC BY-NC não permite monetização</td><td>A licença é CC BY-NC e a conta está marcada como monetizada.</td></tr>
  <tr><td>CC BY-ND não permite derivados</td><td>A licença é CC BY-ND: cortes são obra derivada e são <b>sempre</b> bloqueados.</td></tr>
  <tr><td>Licença não permite monetização</td><td>A fonte não marca “Monetização permitida” e a conta é monetizada.</td></tr></table>
  <div class="row2"><div>${why('<p>Existe <b>uma única regra</b> para essa decisão, aplicada a cada par corte × conta. Ela não depende de quem publica nem de onde: é o que impede que um vídeo sem direito chegue a uma plataforma.</p>')}</div>
  <div>${how('<p>Conta <b>manual</b>: o resultado é <b>Exportada</b> (pacote para você enviar). Conta conectada: ficaria <b>Agendada</b> no próximo horário livre, respeitando as janelas e o limite diário da conta — a conexão automática ainda não está disponível (veja A12).</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A9 · Publicar e a trava de direitos' };

// A10 Publicações
add(screen({ part: 'A', tag: 'A10 · PUBLICAÇÕES', title: 'Publicações: histórico e bloqueios', intro: 'Cada tentativa de publicar vira uma linha aqui, com o motivo quando é bloqueada e o pacote para baixar quando é exportada.',
  body: `${fig('a-publicacoes', [['Chips de status', 'Todas, Bloqueada, Agendada, Publicando, Publicada, Falhou, Cancelada, Retirada do ar e Exportada, cada um com a contagem.'], ['Plataforma', 'filtra por plataforma.'], ['Motivo do bloqueio', '“Bloqueado pelo rights gate” seguido das razões em português.'], ['Bloqueada', 'a trava de direitos impediu a publicação.'], ['Exportada', 'conta manual: o pacote está pronto.'], ['Baixar pacote', 'arquivo zip com <b>video.mp4</b> e <b>metadata.txt</b>.']], { crop: [0, 1160], width: '158mm' })}
  <div class="row2"><div>${warn('<p><b>Bloqueada</b> não é falha do sistema: é a trava funcionando. Para liberar, é preciso corrigir a causa — por exemplo, a licença registrada na Fonte. Se a licença realmente não permite o uso, o corte não pode ser publicado.</p>')}</div>
  <div>${how('<p>A descrição dentro do pacote sempre recebe o <b>texto de atribuição</b> da fonte. Envie o vídeo e o texto pelo aplicativo ou site da plataforma.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'A10 · Publicações' };

// A11 Agenda
add(screen({ part: 'A', tag: 'A11 · AGENDA', title: 'Agenda', intro: 'Calendário semanal das publicações agendadas e já publicadas, coloridas pelo canal de origem.',
  body: `${fig('a-agenda', [['Hoje', 'volta para a semana atual.'], ['Semana', 'setas para navegar entre as semanas.'], ['Legenda de canais', 'cada cor é um canal.'], ['Estado vazio', 'nenhuma publicação agendada na semana.']], { crop: [0, 480], cols: 2 })}
  ${how('<p>Contas conectadas têm <b>janelas de postagem</b> (dias e horários) e um <b>limite diário</b>. No modo automático o sistema escolhe o próximo horário livre que respeita as duas regras.</p>')}
  ${warn('<p>Hoje só existem contas <b>manuais</b>, cujo resultado é um pacote exportado — por isso a Agenda aparece vazia. Ela começará a mostrar publicações quando a conexão automática com as plataformas (OAuth) estiver disponível. A agenda das <b>séries</b> é outra: fica dentro de cada série (B6).</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'A11 · Agenda' };

// A12 Contas
add(screen({ part: 'A', tag: 'A12 · CONTAS', title: 'Contas e integrações', intro: 'Aqui ficam as plataformas de destino e as chaves de IA. As contas “manuais” geram pacotes de exportação.',
  body: `${fig('a-contas', [['Cartão da plataforma', 'nome, estado (Sem chaves, Manual…) e uma frase sobre as regras da plataforma.'], ['Ícone de informação (i)', 'guia passo a passo para obter as chaves daquela plataforma.'], ['Configurar chaves', 'cadastra as chaves (somente admin).'], ['Adicionar conta manual', 'registra uma conta de destino para exportação.'], ['Bilibili', 'sem a Open Platform aprovada: apenas pacote de exportação.'], ['Chaves de IA', 'títulos e hashtags (Claude), narração (ElevenLabs) e OpenAI para as Séries IA.'], ['Contas cadastradas', 'conta, plataforma, canal, dono e estado.']], { crop: [0, 1100], width: '152mm' })}` }));
pages[pages.length - 1].toc = { level: 2, label: 'A12 · Contas e integrações' };

add(screen({ part: 'A', tag: 'A12 · CONTAS', title: 'Chaves das integrações', intro: 'O administrador cadastra as chaves de cada serviço pela própria tela, sem reiniciar nada. O valor salvo aqui tem prioridade sobre o configurado no servidor.',
  body: `<div class="row2" style="align-items:start"><div>${fig('a-contas-info', [['Guia da plataforma', 'passos para criar o aplicativo e copiar o ID e a chave secreta.']], { crop: [180, 790, 480, 840], cols: 1 })}</div><div>${fig('a-contas-chaves', [['Estado', '“Não configurado” até todos os campos obrigatórios estarem preenchidos.'], ['URL de redirecionamento', 'cadastre exatamente esta URL no painel da plataforma. <b>Copiar</b> facilita.'], ['Client ID', 'identificador público do aplicativo.'], ['Client Secret', 'chave secreta; <b>Mostrar</b> revela o texto digitado.'], ['Salvar', 'grava as chaves.'], ['Testar', 'faz uma checagem simples da chave.'], ['Limpar tudo', 'apaga as chaves salvas (volta ao valor do servidor, se houver).']], { crop: [270, 730, 420, 1020], cols: 1 })}</div></div>
  <div class="row2"><div>${why('<p>As chaves são guardadas <b>cifradas</b> e a tela mostra apenas os quatro últimos caracteres. Nem o administrador consegue ler uma chave completa depois de salva.</p>')}</div>
  <div>${warn('<p><b>Conectar (OAuth) ainda não está disponível.</b> Depois de salvar as chaves, o botão “Conectar” aparece no cartão, mas a ligação automática com a conta da plataforma não está concluída nesta versão. A <b>publicação automática continua pendente</b>: use contas manuais e o pacote exportado.</p>')}</div></div>` }));

/* ================= PARTE B ================= */
add(partCover('B', 'Uma ideia vira uma temporada de 20 episódios de cerca de 30 segundos. A IA propõe; você aprova o roteiro e o vídeo de cada um.', [
  ['O que são as Séries IA', ''], ['Nova série (assistente em 5 passos)', ''], ['Tela da série e agenda', ''], ['Bíblia e personagens', ''], ['Episódios e custos', ''], ['Aprovando roteiro e vídeo', ''], ['Modo de teste sem chaves', ''],
]));
pages[pages.length - 1].toc = { level: 1, label: 'Parte B · Séries IA' };

add(screen({ part: 'B', tag: 'B1 · SÉRIES IA', title: 'O que são as Séries IA', intro: 'Histórias em 20 episódios de 30 segundos, geradas por IA, em vídeo vertical e em português. Você aprova o roteiro e o vídeo de cada episódio.',
  body: `${fig('b-series', [['Nova série', 'abre o assistente de criação.'], ['Filtro de status', 'Planejando, Plano pronto, Ativa, Pausada, Concluída, Cancelada…'], ['Estado da série', 'selo no cartão.'], ['Barra de 20 episódios', 'um segmento por episódio, colorido pelo estado.'], ['Próximo passo', 'qual episódio precisa de você e para quando.'], ['Custo', 'gasto até agora, limite (se houver) e estimativa por episódio e por temporada.'], ['Alerta', 'quantos episódios precisam da sua atenção.'], ['Cartão da série', 'clique para abrir a série.']], { crop: [0, 470] })}
  <h2>Como uma série nasce</h2>
  ${flow([pill('info', '1 · Premissa'), pill('info', '2 · IA planeja (bíblia + 20 sinopses)'), pill('wait', '3 · Você revisa e inicia'), pill('info', '4 · Roteiro de cada episódio'), pill('wait', '5 · Você aprova o roteiro'), pill('info', '6 · IA gera imagens, voz e vídeo'), pill('wait', '7 · Você aprova o vídeo'), pill('ok', '8 · Agendado / exportado')])}
  <div class="row2" style="margin-top:3mm"><div>${why('<p>Dois “portões” humanos: <b>aprovar o roteiro</b> libera o gasto com imagens, vídeo e voz; <b>aprovar o vídeo</b> libera a publicação. Assim você controla o custo e o que vai ao ar.</p>')}</div>
  <div>${warn('<p>Cada usuário comum pode ter <b>1 série ativa</b> por vez (padrão; o administrador pode mudar). Os episódios de série entram na Revisão como cortes marcados “Conteúdo gerado por IA”.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B1 · O que são as Séries IA' };

add(screen({ part: 'B', tag: 'B2 · NOVA SÉRIE · PASSO 1', title: 'Nova série: a ideia', intro: 'O assistente tem 5 passos. No primeiro você descreve a ideia, o gênero, o tom e o canal.',
  body: `${fig('b-nova-1', [['Passos', 'Ideia, Estilo e custo, Provedores e voz, Publicação e Revisão e atestação.'], ['Título (opcional)', 'deixe vazio e a IA sugere um.'], ['Premissa', 'de 50 a 4000 caracteres. <b>Não pode ser alterada depois.</b> Escreva o ponto de partida, o conflito e o tom; personagens e desfecho a IA cria.'], ['Gênero e tom', 'escolha nas listas ou use “Outro”.'], ['Canal', 'obrigatório. A série publica nas contas desse canal.'], ['Custo estimado', 'aparece a partir do passo 2.']], { crop: [95, 740, 256, 1440], width: '170mm' })}
  <div class="row2"><div>${why('<p>A premissa é imutável para que a história não “fuja” da ideia original. A IA trata o texto como dado, não como instrução, e recusa premissas que copiem obras protegidas ou retratem pessoas reais.</p>')}</div>
  <div>${warn('<p>Se o canal escolhido não tiver nenhuma conta, você pode criar a série, mas só poderá <b>iniciá-la</b> depois de cadastrar uma conta (manual ou conectada) nesse canal.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B2 · Nova série (assistente em 5 passos)' };

add(screen({ part: 'B', tag: 'B2 · NOVA SÉRIE · PASSO 2', title: 'Estilo visual e custo estimado', intro: 'O passo mais importante: a estratégia visual define quanto cada episódio custa.',
  body: `${fig('b-nova-2', [['Economia', 'só imagens animadas (efeito “slideshow com zoom”). A mais barata.'], ['Híbrido (recomendado)', 'poucas cenas em vídeo e as demais em imagem: equilíbrio entre movimento e custo.'], ['Vídeo completo', 'todas as cenas em vídeo. A mais cara.'], ['Cenas em vídeo por episódio', 'só no Híbrido; padrão 1. Cada cena em vídeo custa mais que uma imagem.'], ['Como calculamos', 'mostra as premissas da estimativa.'], ['Custo estimado', 'por episódio e por temporada, antes de você gastar.']], { crop: [95, 880, 256, 1440], width: '170mm' })}
  <div class="row2"><div>${how('<p>A estimativa assume: <b>5 cenas</b> por episódio de 30 s; narração de cerca de <b>450 caracteres</b>; IA de texto em torno de <b>US$ 0,15 por episódio</b> mais <b>US$ 1,00</b> pelo plano da temporada; e <b>20% de margem</b> para regenerações. Os preços dos provedores são estimativas configuráveis, não faturas.</p>')}</div>
  <div>${why('<p>Nesta demonstração os três estilos mostram o mesmo valor porque os provedores de teste não têm custo. Com provedores reais, Híbrido e Vídeo completo custam mais que Economia. Você só gasta com mídia <b>depois de aprovar cada roteiro</b>.</p>')}</div></div>` }));

add(screen({ part: 'B', tag: 'B2 · NOVA SÉRIE · PASSO 3', title: 'Provedores e voz — e o modo de teste', intro: 'Escolha quem gera a imagem, o vídeo e a narração. Provedores de teste permitem experimentar tudo sem chaves e sem custo.',
  body: `${fig('b-nova-3', [['Provedor de imagem', 'obrigatório. Mostra se está configurado e o custo por imagem.'], ['Provedor de vídeo', 'obrigatório no Híbrido e no Vídeo completo.'], ['Narração (TTS)', 'provedor da voz.'], ['Voz', 'lista de vozes do provedor; “Ouvir” toca uma prévia, quando existe.'], ['Teste, sem custo', 'selo dos provedores de teste.'], ['Configurar chave', 'para o administrador, leva à tela Contas.']], { crop: [95, 880, 256, 1440], width: '170mm' })}
  <div class="row2"><div>${how('<p><b>Modo de teste:</b> quando o servidor está com os provedores de teste ligados, aparecem opções como “Imagem falsa (testes)”, “Vídeo falso (testes)” e “Voz falsa (testes)”, e a IA de texto também é simulada. A história, o fluxo de aprovação e a montagem do vídeo funcionam de verdade, mas o conteúdo é genérico e o custo é zero.</p>')}</div>
  <div>${warn('<p>Provedores sem chave aparecem desabilitados (“não configurado”). Para usar um provedor real, o administrador cadastra a chave em <b>Contas</b>. O texto do roteiro dos testes é padronizado: serve para aprender o fluxo, não para publicar.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B2 · Provedores, voz e modo de teste' };

add(screen({ part: 'B', tag: 'B2 · NOVA SÉRIE · PASSO 4', title: 'Publicação e orçamento', intro: 'Defina quando os episódios vão ao ar, como serão preparados e quanto você aceita gastar.',
  body: `${fig('b-nova-4', [['Horário e fuso', 'padrão 18:00, fuso America/Sao_Paulo.'], ['Antecedência', '1 ou 2 dias (padrão 2): quantos dias antes da publicação o episódio começa a ser preparado.'], ['Privacidade', 'Pública, Privada ou Só eu.'], ['Exigir aprovação do roteiro', 'ligado por padrão: a IA só gasta com mídia depois de você aprovar o roteiro.'], ['Limite de regenerações', 'por episódio, de 0 a 10 (padrão 3), para evitar gasto repetido.'], ['Orçamento da série (US$)', 'opcional. Ao atingir o limite, a série é pausada automaticamente.'], ['Monetização permitida', 'marque se o canal será monetizado: isso afeta em quais plataformas a publicação é liberada.']], { crop: [95, 880, 256, 1440], width: '170mm' })}
  <div class="row2"><div>${why('<p>Com <b>2 dias</b> de antecedência você tem mais folga para aprovar roteiro e vídeo antes da hora marcada.</p>')}</div>
  <div>${warn('<p>Conteúdo gerado em massa por IA pode ter a monetização negada pelas plataformas. Desligar a aprovação do roteiro faz a IA gastar com mídia assim que o roteiro estiver pronto.</p>')}</div></div>` }));

add(screen({ part: 'B', tag: 'B2 · NOVA SÉRIE · PASSO 5', title: 'Revisão e atestação de originalidade', intro: 'Confira o resumo e confirme a declaração de originalidade. Sem ela a série não é criada.',
  body: `${fig('b-nova-5', [['Resumo', 'todos os campos escolhidos nos passos anteriores.'], ['Editar', 'volta ao passo correspondente.'], ['Estimativa da temporada', 'custo estimado e custo por episódio. Você só gasta com mídia depois de aprovar cada roteiro.'], ['Atestação', 'caixa de seleção obrigatória, que começa desmarcada.'], ['Criar série e planejar', 'só fica ativo depois de marcar a declaração.']], { crop: [170, 1160, 256, 1440], width: '165mm' })}
  <div class="box3 how"><div class="t">Texto da declaração</div><p class="small">“Declaro que a premissa é de minha autoria ou que tenho direito de usá-la, e que não pede para copiar personagens, histórias, marcas ou universos protegidos por direitos autorais, nem retratar pessoas reais. Entendo que o conteúdo é gerado por inteligência artificial, será publicado com o rótulo de conteúdo gerado por IA nas plataformas que oferecem esse recurso, e que sou responsável pelo que for publicado no meu canal.”</p></div>
  ${warn('<p>Os episódios são marcados internamente como conteúdo sintético (selo “Conteúdo gerado por IA” na Revisão). O envio desse rótulo às plataformas acontecerá na publicação automática, que ainda não está disponível.</p>')}` }));

add(screen({ part: 'B', tag: 'B3 · TELA DA SÉRIE', title: 'Tela da série: visão geral e agenda', intro: 'Depois de criada, a IA planeja a temporada (leva alguns minutos). Quando o plano fica pronto, você revisa e inicia a série.',
  body: `${fig('b-serie', [['Pausar e Ações', 'o botão principal muda com o estado: Iniciar série, Pausar ou Retomar; o menu <b>Ações</b> traz Replanejar, Cancelar e Excluir quando permitidos.'], ['Abas', 'Visão geral, Bíblia, Episódios (com o número que precisam de ação) e Custos.'], ['Próximo passo para você', 'o que está esperando sua aprovação; <b>Revisar episódio</b> abre o episódio.'], ['Linha do tempo', 'os 20 episódios com data, hora, título e estado. Se a agenda atrasar, aparece “adiado”.'], ['Custo', 'acumulado, limite e estimativa restante.'], ['Configuração', 'estilo, provedores, voz, horário, antecedência e privacidade; <b>Editar</b> altera o que é permitido.']], { crop: [0, 720] })}
  <div class="row2"><div>${how('<p><b>Antes de ativar:</b> a série passa por “Planejando…”, depois “Plano pronto”. Nesse ponto você pode editar a bíblia e as sinopses, e então usar <b>Iniciar série</b> (escolhendo a data do primeiro episódio).</p>')}</div>
  <div>${why('<p><b>Agenda empurrada:</b> se o horário de um episódio passar sem aprovação, ele e os seguintes avançam 1 dia (ou mais, conforme o atraso). Nada é publicado sem a sua aprovação e nenhum episódio é pulado.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B3 · Tela da série e agenda' };

add(screen({ part: 'B', tag: 'B4 · BÍBLIA', title: 'A bíblia da série', intro: 'A bíblia é o “manual do mundo” da história: cenário, estilo, personagens e arco da temporada. A IA a consulta em todos os episódios.',
  body: `${fig('b-biblia', [['Editar bíblia', 'liga o modo de edição; ao salvar, é pedida confirmação.'], ['Mundo', 'cenário, época, regras do mundo e locais.'], ['Estilo', 'voz de narração, estilo visual e elementos proibidos.'], ['Premissa-núcleo', 'palavras-chave da premissa que a IA precisa respeitar; somente leitura.'], ['Arco da temporada', 'tema, pergunta central, resumo do final e fios abertos.']], { crop: [140, 1250], width: '148mm' })}
  ${warn('<p>Salvar a bíblia marca como <b>Desatualizados</b> os episódios cujo roteiro estava pronto ou aguardando aprovação: eles serão reescritos. O aviso mostra quantos serão afetados antes de você confirmar.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'B4 · Bíblia' };

add(screen({ part: 'B', tag: 'B4 · BÍBLIA', title: 'Personagens e seus status', intro: 'A IA pode criar, ferir e até “matar” personagens ao longo dos episódios, mas isso só vale depois que você aprova o vídeo.',
  body: `${fig('b-personagens', [['Filtro', 'Todos, Vivos, Mortos ou Outros.'], ['Cartão do personagem', 'nome, papel, status, em que episódio apareceu e descrição.'], ['Editar e imagem de referência', '<b>Editar</b> muda nome, papel, descrições e personalidade; <b>Imagem de ref.</b> ajuda a manter o mesmo rosto entre cenas.'], ['Eventos de personagem', 'linha do tempo de mudanças de status propostas pela IA.']], { width: '176mm' })}
  <table class="t compact"><tr><th>Status</th><th>Significado</th></tr>
  <tr><td>${pill('ok', 'Vivo')}</td><td>Em cena normalmente.</td></tr><tr><td>${pill('wait', 'Ferido')}</td><td>Em cena, com a condição registrada.</td></tr><tr><td>${pill('neutral', 'Desaparecido')}</td><td>Fora de cena por enquanto.</td></tr><tr><td>${pill('info', 'Transformado')}</td><td>Mudou de forma ou de papel na história.</td></tr><tr><td>${pill('bad', 'Morto')}</td><td>Só reaparece em flashback.</td></tr></table>
  <div class="row2"><div>${why('<p>Mortes e mudanças de status propostas pela IA só entram em vigor quando você <b>aprova o vídeo</b> do episódio. Se você desaprovar depois, os eventos voltam a “propostos”.</p>')}</div>
  <div>${warn('<p>O status do personagem não é editado à mão. A imagem de referência (PNG, JPEG ou WebP, até 5 MB) deve ser algo que você tenha direito de usar — não envie fotos de pessoas reais sem autorização.</p>')}</div></div>` }));

add(screen({ part: 'B', tag: 'B5 · EPISÓDIOS', title: 'Episódios', intro: 'Veja os 20 episódios em grade ou lista e filtre os que precisam de ação.',
  body: `${fig('b-episodios', [['Grade / Lista', 'duas formas de ver os episódios.'], ['Precisam de ação', 'mostra só os episódios que esperam por você.'], ['Fase do arco', 'Apresentação, Tensão crescente, Virada, Escalada, Clímax ou Desfecho.'], ['Cartão do episódio', 'miniatura (quando já há vídeo), título, fase, estado, data, hora e custo. Clique para abrir.'], ['Aprovar vídeo', 'o vídeo está pronto e espera sua aprovação.'], ['Aprovar roteiro', 'o roteiro está pronto e espera sua aprovação.']], { crop: [140, 780], width: '160mm' })}
  <div class="row2"><div>${how('<p>Fases do arco: <b>Apresentação</b> (eps. 1–3), <b>Tensão crescente</b>, <b>Virada</b> (por volta do 10–11), <b>Escalada</b>, <b>Clímax</b> (18–19) e <b>Desfecho</b> (ep. 20).</p>')}</div>
  <div>${why('<p>A aprovação é <b>sequencial</b>: o episódio N só pode ser aprovado depois do N−1. Assim a continuidade da história é preservada.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B5 · Episódios' };

add(screen({ part: 'B', tag: 'B5 · CUSTOS', title: 'Custos da série', intro: 'Acompanhe quanto já foi gasto, em quê e em qual episódio. Os valores são estimativas dos provedores e podem diferir da fatura.',
  body: `${fig('b-custos', [['Total', 'gasto da série e limite de orçamento, se houver.'], ['Por tipo', 'Texto (LLM), Vídeo, Imagem e Voz.'], ['Por episódio', 'custo e percentual do total de cada episódio.'], ['Últimas operações', 'as 100 operações mais recentes: data, tipo, provedor, modelo, episódio e custo.']], { crop: [140, 1000], width: '165mm' })}
  <div class="row2"><div>${how('<p>Quando o gasto chega ao <b>orçamento da série</b>, ela é <b>pausada automaticamente</b> e a tela mostra a faixa de orçamento atingido. Aumente o limite em Configuração e retome.</p>')}</div>
  <div>${why('<p>Há também um orçamento <b>mensal de IA por usuário</b>, definido pelo administrador. Se ele estourar, as séries do usuário são pausadas. Os valores zerados desta demonstração vêm dos provedores de teste.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B5 · Custos' };

add(screen({ part: 'B', tag: 'B6 · EPISÓDIO', title: 'Aprovando o roteiro', intro: 'Clicar em um episódio abre o painel lateral. O primeiro portão: revisar o roteiro antes de gastar com imagem, vídeo e voz.',
  body: `${fig('b-ep-roteiro', [['Cabeçalho', 'número, título, estado, fase, data de publicação, custo e regenerações usadas (ex.: 0/3).'], ['Etapas', 'Roteiro, Aprovar roteiro, Mídia, Montagem, Aprovar vídeo e Agendado: mostra onde o episódio está.'], ['Banner de ação', 'diz o que fazer e o custo estimado da próxima etapa.'], ['Sinopse', 'resumo, eventos-chave e o gancho (cliffhanger) do episódio.'], ['Validação', 'notas de fidelidade, coerência, interesse e aderência à sinopse; bloqueios e avisos.'], ['Roteiro', 'de 3 a 6 cenas, com duração, modo (imagem ou vídeo), personagens, narração e prompt visual.'], ['Botões', '<b>Regenerar…</b>, <b>Editar roteiro</b> e <b>Aprovar roteiro (gera mídia)</b>.']], { crop: [0, 1000], width: '156mm' })}
  <div class="row2"><div>${how('<p>O alvo do roteiro é de <b>26 a 34 s</b> e de <b>55 a 85 palavras</b>. Se a validação encontrar um <b>bloqueio</b> (por exemplo, personagem morto em cena fora de flashback), o botão de aprovar fica indisponível: edite o roteiro ou regenere.</p>')}</div>
  <div>${why('<p>Editar o roteiro volta o episódio para validação e invalida a mídia já gerada. Por isso a edição fica bloqueada enquanto a mídia está sendo gerada.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'B6 · Episódio: roteiro e vídeo' };

add(screen({ part: 'B', tag: 'B6 · EPISÓDIO', title: 'Aprovando o vídeo', intro: 'O segundo portão: assista ao episódio montado e libere (ou não) a publicação.',
  body: `${fig('b-ep-video', [['Player e jobs de mídia', 'o vídeo montado (9:16) e a tabela de voz, imagens e vídeo gerados, cada um com seu estado e custo.'], ['Rejeitar, Regenerar e Aprovar vídeo', 'as três decisões do episódio.']], { crop: [0, 1000, 672, 1440], width: '112mm', cols: 1 })}
  <div class="row3"><div>${how('<p><b>Aprovar vídeo:</b> o episódio é agendado (ou exportado, para conta manual), passando pela trava de direitos, e os eventos de personagem entram em vigor.</p>')}</div>
  <div>${how('<p><b>Regenerar:</b> escolha o escopo — só o roteiro, só a mídia (imagens e vídeo) ou só a narração — e escreva instruções opcionais. Cada episódio tem um limite de regenerações (padrão 3).</p>')}</div>
  <div>${how('<p><b>Rejeitar</b> não publica o episódio; pode regenerar em seguida. <b>Desaprovar</b> (em episódio aprovado ou agendado) volta ao estado de revisão e cancela a publicação agendada.</p>')}</div></div>
  ${warn('<p>Aprovado, mas sem horário livre? O episódio fica “Aprovado (sem horário)” e o sistema tenta de novo sozinho. Só é possível desaprovar enquanto o episódio seguinte não estiver aprovado e antes da publicação.</p>')}` }));

/* ================= PARTE C ================= */
add(partCover('C', 'Quem administra a casa e como cada pessoa cuida da própria conta e do próprio painel.', [
  ['Usuários e cotas', ''], ['Ver como outro usuário', ''], ['Minha conta e troca de senha', ''], ['Auditoria', ''], ['Atalhos, tema e menu recolhível', ''], ['Usando no celular', ''],
]));
pages[pages.length - 1].toc = { level: 1, label: 'Parte C · Administração e conta' };

add(screen({ part: 'C', tag: 'C1 · USUÁRIOS E COTAS', title: 'Usuários e cotas', intro: 'Somente o administrador vê esta tela. Aqui se criam usuários e se define quanto cada um pode usar.',
  body: `${fig('c-usuarios', [['Novo usuário', 'abre o formulário de criação.'], ['Papel e status', 'Admin ou Usuário; Ativo ou desativado; “Troca de senha pendente” quando for o caso.'], ['Uso', 'barra de armazenamento usado e cota.'], ['Consumo do dia', 'análises hoje, canais, séries ativas e gasto com IA no mês.'], ['Editar', 'altera dados e cotas; o menu de mais opções redefine senha e desativa.'], ['Cortes / Publicações', 'total de cada usuário.']], { crop: [0, 380] })}
  ${fig('c-usuario-novo', [['Usuário', 'nome de acesso.'], ['Senha', 'mínimo de 10 caracteres; <b>Gerar senha forte</b> cria uma e <b>Copiar</b> ajuda a enviá-la.'], ['Nome e e-mail', 'opcionais.'], ['Administrador', 'sem cotas e com visão de todos os dados.'], ['Exigir troca de senha', 'marcada por padrão: o usuário troca a senha no primeiro acesso.'], ['Cotas', 'armazenamento (GB), análises por dia, máximo de canais, séries IA ativas e orçamento mensal de IA.'], ['Sem limite', 'deixa a cota ilimitada.'], ['Criar usuário', 'salva.']], { crop: [95, 905, 420, 1020], width: '104mm', cols: 1 })}` }));
pages[pages.length - 1].toc = { level: 2, label: 'C1 · Usuários e cotas' };

add(screen({ part: 'C', tag: 'C1 · USUÁRIOS E COTAS', title: 'Regras de cotas e de contas de usuário', intro: 'O que acontece quando uma cota é atingida e como funcionam os valores padrão.',
  body: `<table class="t"><tr><th>Cota</th><th>Padrão (usuário novo)</th><th>Quando excede</th></tr>
  <tr><td>Armazenamento</td><td>50 GB</td><td>O upload é recusado.</td></tr>
  <tr><td>Análises por dia</td><td>10 (dia no horário de Brasília)</td><td>Novas análises são recusadas até o dia seguinte.</td></tr>
  <tr><td>Canais</td><td>4</td><td>A criação de canal é recusada.</td></tr>
  <tr><td>Séries IA ativas</td><td>1</td><td>A criação de uma nova série ativa é recusada.</td></tr>
  <tr><td>Orçamento mensal de IA</td><td>sem limite</td><td>As séries do usuário são pausadas.</td></tr></table>
  <div class="row2"><div>${how('<p>Os valores padrão valem quando o administrador não informa outro. Marcar <b>Sem limite</b> deixa a cota ilimitada; o administrador é sempre isento.</p>')}${how('<p><b>Redefinir senha:</b> o administrador define uma senha provisória e o usuário precisa trocá-la no próximo acesso. Isso também encerra as sessões abertas dele.</p>')}</div>
  <div>${why('<p><b>Excluir x desativar:</b> um usuário que já tem dados (canais, cortes, auditoria) é apenas <b>desativado</b>; só um usuário completamente vazio é apagado de vez. Um usuário desativado perde o acesso imediatamente.</p>')}${warn('<p>O administrador não pode remover o próprio perfil de admin, nem desativar ou excluir a si mesmo, e o sistema nunca fica sem um admin ativo.</p>')}</div></div>` }));

add(screen({ part: 'C', tag: 'C2 · VER COMO', title: 'Ver como outro usuário', intro: 'O administrador pode enxergar a plataforma como se fosse um usuário, para ajudar ou conferir um problema.',
  body: `${fig('c-vercomo', [['Faixa “Vendo como”', 'fica no topo enquanto o modo está ativo; <b>Voltar para todos</b> encerra.'], ['Indicador no menu', 'lembra de quem é o painel exibido.'], ['Ver como', 'seletor no menu do usuário (clique no seu nome, embaixo à esquerda).'], ['Dados do usuário', 'só os canais, cortes e séries do usuário escolhido aparecem.'], ['Menu do usuário', 'Minha conta, Ver como, tema e Sair.']], { crop: [0, 1000], width: '160mm' })}
  <div class="row2"><div>${why('<p>O administrador normalmente vê <b>tudo</b>. “Ver como” restringe a visão a um usuário. O que o administrador criar nesse modo pertence ao usuário escolhido, e a auditoria registra quem realmente fez a ação.</p>')}</div>
  <div>${warn('<p>Usuários comuns não têm esse seletor. Dados de um usuário nunca aparecem para outro: um item de outra pessoa simplesmente “não existe” para você.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'C2 · Ver como' };

add(screen({ part: 'C', tag: 'C3 · MINHA CONTA', title: 'Minha conta e troca de senha', intro: 'Seus dados, o quanto você já usou das cotas e a troca de senha.',
  body: `${fig('c-conta', [['Meus dados', 'usuário, nome, e-mail e perfil.'], ['Uso e cotas', 'armazenamento, análises hoje, canais, séries ativas e gasto com IA no mês. O administrador vê “sem cotas”.'], ['Trocar senha', 'informe a senha atual, a nova e repita.'], ['Nova senha', 'mínimo de 10 caracteres.']], { crop: [0, 1000], width: '150mm' })}
  <div class="row2"><div>${how('<p>Ao trocar a senha, as <b>outras sessões</b> abertas são encerradas, mas você continua conectado neste navegador.</p>')}</div>
  <div>${warn('<p>Se o administrador exigiu a troca, você só consegue usar o resto da plataforma depois de definir uma senha nova.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'C3 · Minha conta e troca de senha' };

add(screen({ part: 'C', tag: 'C4 · AUDITORIA', title: 'Auditoria', intro: 'O histórico das ações relevantes: quem fez, quando, em qual item.',
  body: `${fig('c-auditoria', [['Filtro', 'digite parte da ação, entidade ou detalhe (aqui, “publication”).'], ['Data', 'dia e hora da ação.'], ['Usuário', 'quem fez. Ações automáticas do sistema aparecem sem usuário.'], ['Ação', 'ex.: publication.create, clip.update, series.agenda_shift.'], ['Detalhes', '<b>Ver JSON</b> mostra os dados registrados.']], { crop: [0, 440] })}
  <div class="row2"><div>${why('<p>A auditoria permite reconstruir o que aconteceu. Ela registra senhas? <b>Nunca</b>. As chaves de integração aparecem só como “quais campos mudaram”, sem os valores.</p>')}</div>
  <div>${how('<p>Quando o administrador age em nome de outro usuário (“Ver como”), o registro guarda o administrador como autor e o usuário escolhido nos detalhes. Cada usuário vê apenas as próprias ações; o administrador vê todas.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'C4 · Auditoria' };

add(screen({ part: 'C', tag: 'C5 · ATALHOS E PERSONALIZAÇÃO', title: 'Ctrl+K, tema e menu recolhível', intro: 'Três recursos para trabalhar mais rápido e do jeito que você preferir.',
  body: `<div class="row2" style="align-items:start"><div><h2>Busca de telas · <kbd>Ctrl</kbd> + <kbd>K</kbd></h2>${fig('c-ctrlk', [['Campo de busca', 'digite parte do nome da tela ou ação.'], ['Resultado', '<kbd>Enter</kbd> abre; <kbd>↑</kbd> <kbd>↓</kbd> navegam; <kbd>Esc</kbd> fecha.'], ['Ajuda', 'resumo das teclas.']], { crop: [190, 700, 460, 980], cols: 1 })}</div>
  <div><h2>Tema claro e escuro</h2>${fig('c-escuro', [['Tema', 'no menu do usuário alterna entre claro e escuro. A escolha fica gravada neste navegador.']], { crop: [560, 840, 0, 440], cols: 1 })}</div></div>
  <h2>Menu lateral recolhível</h2>
  ${fig('c-recolhida', [['Botão de recolher', 'ao lado do logotipo; recolhe o menu para só ícones e a preferência fica gravada.'], ['Menu em ícones', 'passe o mouse ou clique nos ícones para navegar; use o mesmo botão para expandir.']], { crop: [0, 520, 0, 760], width: '125mm', cols: 1 })}` }));
pages[pages.length - 1].toc = { level: 2, label: 'C5 · Ctrl+K, tema e menu recolhível' };

add(screen({ part: 'C', tag: 'C6 · NO CELULAR', title: 'Usando no celular', intro: 'O painel se adapta a telas pequenas: o menu vira um botão no topo e as tabelas viram cartões.',
  body: `<div class="phones"><div><div class="ph"><img src="img/m-visao.png"></div><div class="cap">Visão geral</div></div><div><div class="ph"><img src="img/m-revisao.png"></div><div class="cap">Revisão</div></div><div><div class="ph"><img src="img/m-series.png"></div><div class="cap">Séries IA</div></div></div>
  <div class="row2"><div>${how('<ul><li>O botão com três linhas, no topo à esquerda, abre o menu.</li><li>Há atalhos de tema e de envio de vídeo no cabeçalho.</li><li>Botões e campos têm altura mínima confortável para toque.</li></ul>')}</div>
  <div>${warn('<p>As <b>teclas de atalho</b> (J, K, A, R) existem só no computador. No celular use os botões <b>Aprovar</b> e <b>Rejeitar</b> de cada cartão.</p>')}</div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'C6 · Usando no celular' };

/* ================= PARTE D ================= */
add(partCover('D', 'O mapa das etapas, os estados, os limites, a segurança e as respostas rápidas.', [
  ['Os ciclos de trabalho', ''], ['O que cada selo significa', ''], ['Regras e limites', ''], ['O que ainda não está disponível', ''], ['Segurança e privacidade', ''], ['Dúvidas frequentes', ''], ['Glossário', ''],
]));
pages[pages.length - 1].toc = { level: 1, label: 'Parte D · Como tudo se conecta' };

const step = (n, b, p, w) => `<div class="step"><div class="no">${n}</div><b>${b}</b><p>${p}</p><div class="where">${w}</div></div>`;
add(screen({ part: 'D', tag: 'D1 · OS CICLOS', title: 'Os três ciclos de trabalho', intro: 'Tudo na plataforma segue um destes caminhos. Em todos, a decisão final é sua e a trava de direitos está no meio.',
  body: `<div class="cycle" style="--accent:#4f46e5"><h2>Ciclo do corte</h2><div class="cards">
    ${step(1, 'Upload', 'Você envia o vídeo escolhendo a fonte (licença).', 'Onde: Upload')}
    ${step(2, 'Análise', 'O sistema acha os melhores trechos e gera os cortes verticais.', 'Onde: Upload › Analisar · Jobs')}
    ${step(3, 'Revisão', 'Você aprova, rejeita ou ajusta o recorte e os textos.', 'Onde: Revisão')}
    ${step(4, 'Publicação', 'A trava confere; o corte é exportado ou agendado.', 'Onde: Publicar · Publicações')}</div></div>
  <div class="cycle" style="--accent:#7c3aed"><h2>Ciclo da série</h2><div class="cards">
    ${step(1, 'Plano', 'Premissa, estilo e custo; a IA monta bíblia e 20 sinopses.', 'Onde: Nova série · Bíblia')}
    ${step(2, 'Roteiro', 'A IA escreve e valida; você aprova o roteiro.', 'Onde: Episódios › Aprovar roteiro')}
    ${step(3, 'Mídia', 'A IA gera imagens, voz e vídeo e monta o episódio.', 'Onde: Episódios (automático)')}
    ${step(4, 'Aprovação e agenda', 'Você aprova o vídeo; o episódio é agendado ou exportado.', 'Onde: Episódios › Aprovar vídeo')}</div></div>
  <div class="cycle" style="--accent:#047857"><h2>Ciclo da publicação</h2><div class="cards">
    ${step(1, 'Trava de direitos', 'Confere licença, validade, plataforma e monetização.', 'Onde: Publicar')}
    ${step(2, 'Agenda', 'Conta conectada: próximo horário livre. Conta manual: pacote.', 'Onde: Agenda')}
    ${step(3, 'Exportar ou publicar', 'Baixe o pacote e envie; a publicação automática virá depois.', 'Onde: Publicações')}
    ${step(4, 'Acompanhar', 'Veja estados, falhas e a trilha de auditoria.', 'Onde: Publicações · Auditoria')}</div></div>
  ${why('<p>Os ciclos se encontram na <b>trava de direitos</b>: um corte, e também um episódio de série, só vira publicação se passar por ela. Episódios de série usam uma fonte “Gerado por IA” que a própria série cria.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'D1 · Os ciclos de trabalho' };

add(screen({ part: 'D', tag: 'D2 · ESTADOS', title: 'O que cada selo significa', intro: 'Os estados aparecem sempre com texto, além de cor, para ficar claro o que fazer.',
  body: `<h2>Corte</h2>${flow([pill('info', 'Renderizando'), pill('wait', 'Aguardando revisão'), pill('ok', 'Aprovado'), pill('bad', 'Rejeitado')])}<p class="small muted" style="margin-top:1mm">“Falhou” aparece se a geração do corte der erro.</p>
  <h2 style="margin-top:3mm">Job de análise</h2>${flow([pill('neutral', 'Na fila'), pill('info', 'Processando'), pill('ok', 'Concluído')])}<p class="small muted" style="margin-top:1mm">Também: Falhou e Cancelado.</p>
  <h2 style="margin-top:3mm">Publicação</h2>${flow([pill('bad', 'Bloqueada'), pill('neutral', 'Exportada'), pill('wait', 'Agendada'), pill('info', 'Publicando'), pill('ok', 'Publicada')])}<p class="small muted" style="margin-top:1mm">Também: Falhou, Cancelada e Retirada do ar. <b>Bloqueada</b> = a trava impediu; <b>Exportada</b> = conta manual com pacote pronto.</p>
  <h2 style="margin-top:3mm">Série</h2>${flow([pill('info', 'Planejando…'), pill('wait', 'Plano pronto'), pill('ok', 'Ativa'), pill('wait', 'Pausada'), pill('ok', 'Concluída')])}<p class="small muted" style="margin-top:1mm">Também: Falha no plano e Cancelada. Pausada por você, por orçamento estourado, por cota de armazenamento cheia ou por provedor indisponível — a tela diz o que fazer.</p>
  <h2 style="margin-top:3mm">Episódio</h2>${flow([pill('neutral', 'Planejado'), pill('info', 'Escrevendo roteiro…'), pill('info', 'Validando roteiro…'), pill('info', 'Roteiro pronto'), pill('wait', 'Aprovar roteiro'), pill('info', 'Gerando mídia…'), pill('info', 'Montando vídeo…'), pill('wait', 'Aprovar vídeo'), pill('ok', 'Agendado'), pill('ok', 'Publicado')])}
  <p class="small muted" style="margin-top:1mm">Outros: <b>Aprovado (sem horário)</b> — espera um horário livre; <b>Rejeitado</b>; <b>Desatualizado</b> — a bíblia ou o episódio anterior mudou e ele será reescrito; <b>Precisa de atenção</b> — algo falhou depois das tentativas automáticas e exige uma ação sua; <b>Cancelado</b>.</p>
  ${how('<p>Os selos amarelos (<b>Aprovar roteiro</b>, <b>Aprovar vídeo</b>, <b>Aguardando revisão</b>) são os que esperam por <b>você</b>. Eles aparecem também na Visão geral e no número do menu lateral.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'D2 · O que cada selo significa' };

add(screen({ part: 'D', tag: 'D3 · REGRAS E LIMITES', title: 'Regras e limites', intro: 'Os números abaixo são os padrões do sistema; o administrador pode ajustar as cotas por usuário.',
  body: `<div class="row2" style="align-items:start">
  <div class="block" style="--accent:#4f46e5"><div class="bh">Cortes e publicação</div><table class="t compact">
    <tr><td>Arquivos aceitos</td><td>.mp4, .mkv, .mov e .srt</td></tr>
    <tr><td>Upload</td><td>partes de 50 MB, até 5 novas tentativas</td></tr>
    <tr><td>Duração dos cortes</td><td>15 a 60 s (padrão)</td></tr>
    <tr><td>Cortes por análise</td><td>até 6 (padrão)</td></tr>
    <tr><td>Formato de saída</td><td>vertical 1080×1920</td></tr>
    <tr><td>Desfazer na Revisão</td><td>cerca de 6 s</td></tr>
    <tr><td>Trava de direitos</td><td>6 motivos de bloqueio (A9)</td></tr>
    <tr><td>Conta manual</td><td>pacote zip: video.mp4 + metadata.txt</td></tr>
    <tr><td>Atribuição</td><td>sempre incluída na descrição</td></tr></table></div>
  <div class="block" style="--accent:#7c3aed"><div class="bh">Séries IA</div><table class="t compact">
    <tr><td>Temporada</td><td>20 episódios de cerca de 30 s</td></tr>
    <tr><td>Roteiro</td><td>3 a 6 cenas; 55 a 85 palavras</td></tr>
    <tr><td>Premissa</td><td>50 a 4000 caracteres, imutável</td></tr>
    <tr><td>Antecedência</td><td>1 ou 2 dias (padrão 2)</td></tr>
    <tr><td>Horário padrão</td><td>18:00 (America/Sao_Paulo)</td></tr>
    <tr><td>Regenerações</td><td>0 a 10 por episódio (padrão 3)</td></tr>
    <tr><td>Séries ativas</td><td>1 por usuário (padrão)</td></tr>
    <tr><td>Aprovação</td><td>sequencial; roteiro e vídeo</td></tr>
    <tr><td>Atraso</td><td>agenda anda 1 dia (ou mais)</td></tr></table></div></div>
  <div class="block" style="--accent:#0369a1;margin-top:4mm"><div class="bh">Conta, cotas e segurança</div><table class="t compact">
    <tr><td style="width:30%">Senha</td><td>mínimo de 10 caracteres</td><td style="width:26%">Sessão</td><td>7 dias</td></tr>
    <tr><td>Tentativas de login</td><td>5 erradas em 15 min bloqueiam temporariamente</td><td>Armazenamento</td><td>50 GB (padrão)</td></tr>
    <tr><td>Análises por dia</td><td>10 (padrão)</td><td>Canais</td><td>4 (padrão)</td></tr>
    <tr><td>Administrador</td><td>sem cotas</td><td>Orçamento de IA</td><td>opcional, por série e por mês</td></tr></table></div>
  ${warn('<p>Ao atingir uma cota: o <b>upload</b> é recusado (armazenamento), as novas <b>análises</b> param até o dia seguinte, a criação de <b>canais</b> e de <b>séries ativas</b> é recusada e as <b>séries</b> são pausadas quando o orçamento de IA acaba.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'D3 · Regras e limites' };

add(screen({ part: 'D', tag: 'D4 · O QUE FALTA', title: 'O que ainda não está disponível', intro: 'Para evitar surpresas: o que funciona hoje e o que ainda está em desenvolvimento nesta versão.',
  body: `<table class="t"><tr><th style="width:30%">Recurso</th><th style="width:20%">Situação</th><th>O que fazer hoje</th></tr>
  <tr><td>Envio, análise, revisão e exportação de cortes</td><td>${pill('ok', 'Funciona')}</td><td>Use normalmente (Parte A).</td></tr>
  <tr><td>Séries IA com provedores de teste</td><td>${pill('ok', 'Funciona')}</td><td>Teste o fluxo completo sem custo (Parte B).</td></tr>
  <tr><td>Séries IA com provedores reais</td><td>${pill('wait', 'Depende de chaves')}</td><td>O administrador cadastra as chaves em <b>Contas</b>. A voz da ElevenLabs já tem integração; imagem e vídeo reais entram quando o provedor for escolhido.</td></tr>
  <tr><td>Conectar contas por OAuth (YouTube, TikTok, Meta, Vimeo)</td><td>${pill('bad', 'Pendente')}</td><td>Cadastre contas manuais.</td></tr>
  <tr><td>Publicação automática e retirada do ar</td><td>${pill('bad', 'Pendente')}</td><td>Baixe o <b>pacote</b> em Publicações e envie pelo site ou app da plataforma.</td></tr>
  <tr><td>Agenda com publicações</td><td>${pill('wait', 'Depende do OAuth')}</td><td>Fica vazia enquanto só há contas manuais.</td></tr>
  <tr><td>Rótulo de IA enviado às plataformas</td><td>${pill('wait', 'Depende da publicação automática')}</td><td>O episódio já é marcado como conteúdo sintético; ao enviar manualmente, marque o rótulo de IA na plataforma.</td></tr>
  <tr><td>Encurtadores de link</td><td>${pill('neutral', 'Em breve')}</td><td>A área aparece no menu, mas ainda não está disponível.</td></tr></table>
  ${warn('<p>Ao publicar manualmente conteúdo de uma série IA, use o recurso de <b>rótulo de conteúdo gerado por IA</b> da plataforma, como você declarou na atestação ao criar a série.</p>')}` }));
pages[pages.length - 1].toc = { level: 2, label: 'D4 · O que ainda não está disponível' };

add(screen({ part: 'D', tag: 'D5 · SEGURANÇA E PRIVACIDADE', title: 'Segurança e privacidade', intro: 'Como a plataforma protege o acesso, os seus dados e as chaves que você cadastra.',
  body: `<div class="sec"><h3>Acesso com sessão protegida</h3><p>Você entra com usuário e senha; a sessão fica em um cookie que o navegador não deixa páginas lerem (httpOnly) e vale 7 dias. Ao trocar a senha, as outras sessões são encerradas; uma conta desativada perde o acesso na hora.</p></div>
  <div class="sec"><h3>Senhas nunca são guardadas como texto</h3><p>Só é guardada uma “impressão” da senha (hash argon2). Além disso, 5 tentativas erradas em 15 minutos bloqueiam temporariamente aquele usuário naquele computador.</p></div>
  <div class="sec"><h3>Cada um vê só o que é seu</h3><p>Canais, fontes, vídeos, cortes, séries e contas pertencem a um usuário. Um item de outra pessoa se comporta como se não existisse. Apenas o administrador vê tudo, e “Ver como” fica registrado.</p></div>
  <div class="sec"><h3>Chaves de integração cifradas</h3><p>Chaves de API e tokens são guardados cifrados e a tela mostra só os quatro últimos caracteres. Elas nunca aparecem na auditoria nem em respostas do sistema.</p></div>
  <div class="sec"><h3>Uploads só com licença e sessão</h3><p>O envio exige sessão válida, fonte cadastrada e respeita a cota. Os arquivos ficam em pastas separadas por usuário.</p></div>
  <div class="sec"><h3>Trilha de auditoria</h3><p>Ações relevantes (criar, aprovar, publicar, alterar contas e cotas) ficam registradas com autor e horário. Senhas, chaves e o conteúdo dos prompts de IA não são gravados.</p></div>
  <div class="sec"><h3>Privacidade com serviços de IA</h3><p>Quando um provedor de IA está configurado, o texto necessário para gerar o resultado — premissa, roteiro, transcrição do corte ou texto da narração — é enviado a esse provedor. Os provedores de teste não enviam nada para fora.</p></div>
  <div class="sec"><h3>Conteúdo gerado por IA</h3><p>Episódios de série são marcados como conteúdo sintético e a atestação de originalidade é obrigatória para criar a série.</p></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'D5 · Segurança e privacidade' };

add(screen({ part: 'D', tag: 'D6 · DÚVIDAS FREQUENTES', title: 'Dúvidas frequentes', intro: '',
  body: `<dl class="faq">
  <dt>Posso usar qualquer vídeo do YouTube?</dt><dd>Não. Só vídeos que você tem direito de cortar e republicar: seus, licenciados, de domínio público ou Creative Commons que permita uso comercial e obras derivadas (por exemplo, CC BY). Veja A4.</dd>
  <dt>Cortei só 10 segundos. Posso publicar?</dt><dd>Não existe duração segura. Sem licença, qualquer trecho continua protegido.</dd>
  <dt>Por que meu corte ficou “Bloqueada”?</dt><dd>A trava de direitos encontrou um problema. Abra <b>Publicações</b> e leia o motivo ao lado do selo (A9 e A10).</dd>
  <dt>Aprovei sem querer. E agora?</dt><dd>Clique em <b>Desfazer</b> no aviso que aparece por alguns segundos. Passado esse prazo (cerca de 6 s), a decisão é enviada ao sistema.</dd>
  <dt>Posso publicar direto no YouTube ou no TikTok?</dt><dd>Ainda não. Use contas manuais e o pacote exportado (veja D4).</dd>
  <dt>Esqueci a senha.</dt><dd>Peça ao administrador para redefini-la; você troca a senha provisória no próximo acesso.</dd>
  <dt>Por que não vejo “Usuários” nem “Configurar chaves”?</dt><dd>São recursos do administrador.</dd>
  <dt>Quanto custa uma série?</dt><dd>O custo estimado aparece antes de criar (B2) e na tela da série. Você só gasta com mídia depois de aprovar cada roteiro; com provedores de teste, nada.</dd>
  <dt>E se eu não aprovar o episódio a tempo?</dt><dd>Nada é publicado sem a sua aprovação. A agenda avança 1 dia (ou mais) e nenhum episódio é pulado.</dd>
  <dt>Posso mudar a premissa depois de criar a série?</dt><dd>Não. Você pode editar a bíblia, as sinopses (antes de iniciar), os roteiros e a configuração; a premissa é imutável.</dd>
  <dt>A IA pode copiar um filme ou personagem famoso?</dt><dd>Ela é instruída a recusar, e você declara na atestação que a premissa é original. A responsabilidade pelo que for publicado é sua.</dd>
  <dt>Qual é o limite de tamanho do upload?</dt><dd>O limite é a sua cota de armazenamento (padrão de 50 GB). O envio é feito em partes de 50 MB e retoma sozinho se cair.</dd></dl>` }));
pages[pages.length - 1].toc = { level: 2, label: 'D6 · Dúvidas frequentes' };

add(screen({ part: 'D', tag: 'D7 · GLOSSÁRIO', title: 'Glossário', intro: '',
  body: `<div class="gl">
  <div><b>Atestação de originalidade</b><span>Declaração obrigatória ao criar uma série: a premissa é sua (ou você tem direito de usá-la) e não copia obras protegidas.</span></div>
  <div><b>Bíblia</b><span>Documento da série com mundo, estilo, personagens, arco da temporada e fios abertos.</span></div>
  <div><b>CC BY / BY-SA / BY-NC / BY-ND</b><span>Licenças Creative Commons: atribuição; atribuição com compartilhamento igual; não comercial; sem derivações. NC bloqueia monetização e ND bloqueia cortes.</span></div>
  <div><b>Cliffhanger</b><span>Gancho no fim do episódio que deixa a curiosidade para o próximo.</span></div>
  <div><b>Corte</b><span>Trecho curto e vertical (1080×1920) extraído de um vídeo maior.</span></div>
  <div><b>Cota</b><span>Limite de uso por usuário: armazenamento, análises por dia, canais, séries ativas e orçamento de IA.</span></div>
  <div><b>Episódio</b><span>Cada um dos 20 vídeos de cerca de 30 s de uma série.</span></div>
  <div><b>Exportada</b><span>Publicação de conta manual: o pacote (zip) está pronto para você enviar.</span></div>
  <div><b>Fonte</b><span>Registro de origem e licença de um vídeo. Todo vídeo precisa de uma.</span></div>
  <div><b>Job</b><span>Tarefa em segundo plano, como uma análise de vídeo.</span></div>
  <div><b>Obra derivada</b><span>Obra criada a partir de outra, como um corte. Licenças ND proíbem.</span></div>
  <div><b>OAuth</b><span>Forma segura de uma plataforma autorizar o app a publicar na sua conta sem compartilhar a senha. Ainda não disponível aqui.</span></div>
  <div><b>Preset</b><span>Conjunto de pesos da análise por gênero: Ação, Drama, Comédia, Suspense ou Personalizado.</span></div>
  <div><b>Premissa</b><span>Ideia inicial da série. Não pode ser alterada depois.</span></div>
  <div><b>Provedor</b><span>Serviço que gera imagem, vídeo ou voz (ou escreve o texto) de uma série.</span></div>
  <div><b>Rights gate (trava de direitos)</b><span>Regra única que impede publicar sem licença válida, plataforma permitida e monetização compatível.</span></div>
  <div><b>Score</b><span>Nota de intensidade de um trecho, de 0 a 1, usada para ordenar os cortes.</span></div>
  <div><b>Sintético</b><span>Conteúdo gerado por IA; recebe selo e declaração própria.</span></div>
  <div><b>Slug</b><span>Identificador curto de um canal (ex.: acao-em-60s).</span></div>
  <div><b>Ver como</b><span>Modo do administrador para enxergar a plataforma como um usuário.</span></div></div>` }));
pages[pages.length - 1].toc = { level: 2, label: 'D7 · Glossário' };

module.exports = pages;
