// Capturas da Parte A (Cortes). Uso: node shoot_a.js [prefixo-do-nome]
const L = require('./lib.js');
const only = process.argv[2];
const T = (sel, label, extra = {}) => ({ sel, label, ...extra });
const U = (sels, label, extra = {}) => ({ sels, label, ...extra });
const txt = (s, o = {}) => (p) => p.getByText(s, { exact: o.exact ?? false });
const role = (r, name, o = {}) => (p) => p.getByRole(r, { name, ...o });
const dlg = (f) => (p) => f(p.getByRole('dialog'));
const API = 'http://localhost:18000/api';
(async () => {
  const b = await L.launch();
  const run = async (name, fn) => { if (only && !name.startsWith(only)) return; try { await fn(); } catch (e) { console.log('ERRO', name, e.message.slice(0, 300)); } };
  await run('a-login', async () => {
    const { page } = await L.newSession(b, null, { h: 800 });
    await L.go(page, '/login');
    await L.shot(page, 'a-login', [T('input[name=username],input[type=text]', 'usuario'), T('input[type=password]', 'senha'), T('button[type=submit]', 'entrar')]);
  });
  const { page, ctx } = await L.newSession(b, 'ana.demo', { h: 900 });
  const vp = (h) => page.setViewportSize({ width: 1440, height: h });
  await run('a-visao', async () => {
    await vp(900); await L.go(page, '/cortes');
    await L.shot(page, 'a-visao', [
      T(txt('Precisa da sua atenção'), 'atencao', { up: 1, pad: 0 }),
      U([txt('Aguardando revisão', { exact: true }), txt('Jobs ativos'), txt('Agendadas', { exact: true }), txt('Publicadas', { exact: true })], 'kpis', { card: true }),
      T(txt('Próximos agendamentos'), 'agend', { card: true }),
      T(txt('Jobs em andamento'), 'jobs', { card: true }),
      U([txt('Cortes por status'), txt('Publicações por status')], 'status', { card: true }),
      T('button:has-text("Todos os canais")', 'canal'),
      U([role('link', /Enviar vídeo/), role('link', /Revisar cortes/)], 'botoes'),
      T('aside, nav', 'menu', { nth: 0, pad: 0, side: 'tr' }),
    ]);
  });
  await run('a-canais', async () => {
    await vp(800); await L.go(page, '/cortes/canais');
    await L.shot(page, 'a-canais', [
      T(role('button', /Novo canal/), 'novo'),
      T(txt('Ação em 60s', { exact: true }), 'card', { card: true, nth: 0 }),
      T(txt('Contas conectadas (3/6)'), 'contas', { nth: 0, up: 1 }),
      T(txt('Em revisão', { exact: true }), 'contadores', { nth: 2, up: 2 }),
      T(role('button', 'Editar'), 'acoes', { nth: 2, up: 1, pad: 2 }),
    ]);
  });
  await run('a-canal-novo', async () => {
    await vp(1250); await L.go(page, '/cortes/canais');
    await page.getByRole('button', { name: /Novo canal/ }).click(); await page.waitForTimeout(600);
    await page.getByLabel(/^Nome/).fill('Curiosidades do Mar'); await page.getByLabel(/^Slug/).fill('curiosidades-do-mar'); await page.getByLabel('Nicho').fill('Curiosidades sobre o mar');
    await page.getByLabel('Preset padrão').selectOption({ label: 'Drama' }).catch(() => {});
    await L.shot(page, 'a-canal-novo', [
      U([(p) => p.getByLabel(/^Nome/), (p) => p.getByLabel(/^Slug/)], 'nome'),
      U([(p) => p.getByLabel('Nicho'), (p) => p.getByText('#6366f1')], 'nicho-cor'),
      T((p) => p.getByLabel('Preset padrão'), 'preset'),
      T(txt('Pesos por sinal'), 'pesos', { up: 1, pad: 6 }),
      U([(p) => p.getByLabel(/Duração mínima/), (p) => p.getByText('Queimar legendas no vídeo')], 'params'),
      T(txt('Template de publicação'), 'template', { up: 1 }),
    ]);
  });
  await run('a-fontes', async () => {
    await vp(800); await L.go(page, '/cortes/fontes-licencas');
    await L.shot(page, 'a-fontes', [
      T(role('button', /Nova fonte/), 'nova'),
      T(txt('Aviso de licenciamento'), 'aviso', { card: false, up: 2, pad: 0 }),
      T(txt('CC BY (Atribuição)', { exact: true }), 'ccby', { anc: 'td' }),
      T(txt('CC BY-NC (Não comercial)', { exact: true }), 'ccbync', { anc: 'td' }),
      T(txt('CC BY-ND (Sem derivações)', { exact: true }), 'ccbynd', { anc: 'td' }),
      T(txt('Domínio público', { exact: true }), 'pd', { anc: 'td' }),
    ]);
  });
  await run('a-fonte-form', async () => {
    await vp(1000); await L.go(page, '/cortes/fontes-licencas');
    await page.getByRole('button', { name: /Nova fonte/ }).click(); await page.waitForTimeout(600);
    await page.getByLabel(/^Título/).fill('Sintel — Blender Foundation'); await page.getByLabel(/^Nome da obra/).fill('Sintel');
    await page.getByLabel(/^Tipo de licença/).selectOption({ label: 'CC BY (Atribuição)' });
    await page.getByLabel('URL de comprovação').fill('https://durian.blender.org/sharing/');
    await page.getByLabel('Territórios').fill('BR, US');
    await page.getByLabel('YouTube', { exact: true }).check(); await page.getByLabel('TikTok', { exact: true }).check();
    await page.getByLabel('Monetização permitida').check();
    await page.getByLabel('Texto de atribuição').fill('Sintel © Blender Foundation | durian.blender.org (CC BY 3.0)');
    await L.shot(page, 'a-fonte-form', [
      U([(p) => p.getByLabel(/^Título/), (p) => p.getByLabel(/^Nome da obra/)], 'titulo'),
      T((p) => p.getByLabel(/^Tipo de licença/), 'tipo'),
      T((p) => p.getByLabel('URL de comprovação'), 'url'),
      U([(p) => p.getByLabel('Válido a partir de'), (p) => p.getByLabel('Válido até')], 'validade'),
      T((p) => p.getByLabel('Territórios'), 'terr'),
      U([txt('Plataformas permitidas'), (p) => p.getByLabel('Vimeo', { exact: true })], 'plat'),
      T((p) => p.getByLabel('Monetização permitida'), 'monet', { up: 1 }),
      T((p) => p.getByLabel('Texto de atribuição'), 'atrib'),
      T(role('button', 'Criar fonte'), 'criar'),
    ]);
  });
  await run('a-upload', async () => {
    await vp(1000); await L.go(page, '/cortes/upload');
    const sel = page.locator('#source-select');
    const opt = await sel.locator('option').allTextContents(); const i = opt.findIndex((t) => t.includes('Sintel')); await sel.selectOption({ index: i });
    await page.waitForTimeout(600);
    await L.shot(page, 'a-upload', [
      T('#source-select', 'fonte'),
      T('main select', 'canal', { nth: 1 }),
      T(txt('Só envie conteúdo'), 'aviso', { up: 0, pad: 0 }),
      T(txt('Formatos aceitos'), 'drop', { up: 1, pad: 0 }),
      T(txt('Uploads recebidos'), 'tabela', { up: 2, pad: 0 }),
      T(role('button', 'Analisar'), 'analisar', { pad: 2 }),
      T(role('button', 'Ver vídeo'), 'ver', { pad: 2 }),
    ]);
  });
  await run('a-analisar', async () => {
    await vp(900); await L.go(page, '/cortes/upload');
    await page.getByRole('button', { name: 'Analisar' }).nth(3).click(); await page.waitForTimeout(900);
    await L.shot(page, 'a-analisar', [
      T(dlg((d) => d.getByLabel('Canal')), 'canal'),
      T(dlg((d) => d.getByLabel(/Preset/)), 'preset'),
      U([dlg((d) => d.getByLabel(/Duração mínima/)), dlg((d) => d.getByLabel(/Duração máxima/))], 'duracao'),
      T(dlg((d) => d.getByLabel('Máximo de cortes')), 'max'),
      T(dlg((d) => d.getByLabel('Idioma')), 'idioma'),
      T(dlg((d) => d.getByLabel('Reenquadramento')), 'reenq'),
      T(dlg((d) => d.getByLabel('Queimar legendas')), 'leg', { up: 1 }),
      T(dlg((d) => d.getByRole('button', { name: 'Iniciar análise' })), 'iniciar'),
    ]);
  });
  await run('a-jobs', async () => {
    const assets = await (await ctx.request.get(API + '/media-assets')).json();
    const m = assets.find((x) => x.filename.startsWith('sintel'));
    await ctx.request.post(`${API}/media-assets/${m.id}/analyze`, { data: { preset: 'action', params: { max_clips: 3, burn_subtitles: false } } });
    await vp(700); await page.waitForTimeout(6000); await L.go(page, '/cortes/jobs', 400);
    await L.shot(page, 'a-jobs', [
      T((p) => p.getByLabel('Status'), 'filtro'),
      T(txt('Processando', { exact: true }), 'badge', { nth: 0 }),
      T('[role=progressbar]', 'barra', { nth: 0, up: 1 }),
      T(txt('Concluído', { exact: true }), 'concl', { nth: 0 }),
      T(role('link', 'Ver cortes'), 'ver', { nth: 1 }),
    ]);
  });
  await run('a-revisao', async () => {
    await vp(900); await L.go(page, '/cortes/revisao');
    await L.shot(page, 'a-revisao', [
      T((p) => p.getByRole('combobox').first(), 'status'),
      T('button:has-text("J/K")', 'atalhos'),
      T(role('button', 'Ver detalhes'), 'card', { nth: 0, card: true, pad: 2 }),
      T(txt(/^\d+s$/), 'dur', { nth: 0 }),
      T(txt(/^Score/), 'score', { nth: 0 }),
      U([role('button', 'Aprovar', { exact: true }), role('button', 'Rejeitar', { exact: true })], 'botoes', { nth: 0 }),
      T(role('button', 'Ver detalhes'), 'detalhes', { nth: 1 }),
      T((p) => p.getByLabel('Selecionar'), 'sel', { nth: 0 }),
    ]);
  });
  await run('a-revisao-lote', async () => {
    await vp(900); await L.go(page, '/cortes/revisao');
    await page.getByRole('combobox').first().selectOption('approved'); await page.waitForTimeout(1000);
    await page.getByLabel('Selecionar').nth(0).check(); await page.getByLabel('Selecionar').nth(1).check(); await page.waitForTimeout(400);
    await L.shot(page, 'a-revisao-lote', [
      T(txt('2 selecionados'), 'sel'),
      U([role('button', 'Aprovar', { exact: true }), role('button', 'Rejeitar', { exact: true })], 'ar', { nth: 0 }),
      T(role('button', /Publicar \(2\)/), 'publicar'),
      T(role('button', 'Limpar seleção'), 'limpar'),
    ]);
  });
  await run('a-corte', async () => {
    await vp(1050); await L.go(page, '/cortes/revisao');
    await page.getByRole('button', { name: 'Ver detalhes' }).nth(1).click(); await page.waitForTimeout(1500);
    await L.shot(page, 'a-corte', [
      T(dlg((d) => d.locator('video')), 'player'),
      U([dlg((d) => d.getByText('YouTube Shorts', { exact: true })), dlg((d) => d.getByText('Vimeo', { exact: true }))], 'abas', { pad: 6 }),
      T(dlg((d) => d.getByLabel(/^Título/)), 'titulo'),
      T(dlg((d) => d.getByLabel(/^Descrição/)), 'desc'),
      T(dlg((d) => d.getByLabel(/^Hashtags/)), 'hash'),
      U([dlg((d) => d.getByRole('button', { name: 'Salvar', exact: true })), dlg((d) => d.getByRole('button', { name: 'Regenerar todas' }))], 'salvar'),
      T(dlg((d) => d.getByText('Ajuste fino (segundos)')), 'ajuste', { up: 1 }),
      U([dlg((d) => d.getByRole('button', { name: /Aprovar \(A\)/ })), dlg((d) => d.getByRole('button', { name: /Rejeitar \(R\)/ }))], 'ar'),
    ]);
  });
  await run('a-publicar', async () => {
    await vp(900); await L.go(page, '/cortes/revisao');
    await page.getByRole('combobox').first().selectOption('approved'); await page.waitForTimeout(1000);
    await page.getByLabel('Selecionar').nth(0).check(); await page.getByRole('button', { name: /Publicar \(/ }).click(); await page.waitForTimeout(900);
    await L.shot(page, 'a-publicar', [
      T(dlg((d) => d.getByText('Destino')), 'destino', { up: 1 }),
      T(dlg((d) => d.getByLabel('Agendamento')), 'agend'),
      T(dlg((d) => d.getByLabel('Privacidade')), 'priv'),
      T(dlg((d) => d.getByRole('button', { name: 'Publicar', exact: true })), 'publicar'),
    ]);
  });
  await run('a-publicacoes', async () => {
    await vp(1250); await L.go(page, '/cortes/publicacoes');
    await L.shot(page, 'a-publicacoes', [
      T(role('button', /^Todas/), 'chips', { up: 1 }),
      T((p) => p.getByLabel('Plataforma'), 'plat'),
      T(txt('Bloqueado pelo rights gate'), 'motivo', { nth: 0, up: 1 }),
      T(txt('Bloqueada', { exact: true }), 'status', { nth: 0 }),
      T(txt('Exportada', { exact: true }), 'exp', { nth: 1 }),
      T(role('link', 'Baixar pacote'), 'baixar', { nth: 0 }),
    ]);
  });
  await run('a-agenda', async () => {
    await vp(600); await L.go(page, '/cortes/agenda');
    await L.shot(page, 'a-agenda', [
      T(role('button', 'Hoje'), 'hoje'),
      T(txt(/de out\./), 'semana', { nth: 0 }),
      T(txt('Dicas Rápidas'), 'legenda', { nth: 0, up: 1 }),
      T(txt('Nenhuma publicação agendada'), 'vazio', { up: 2, pad: 0 }),
    ]);
  });
  await run('a-contas', async () => {
    await vp(1100); await L.go(page, '/cortes/contas');
    await L.shot(page, 'a-contas', [
      T(txt('YouTube Shorts', { exact: true }), 'yt', { nth: 0, card: true }),
      T(role('button', /Como obter as chaves do YouTube/), 'info'),
      T(role('button', 'Configurar chaves'), 'chaves', { nth: 0 }),
      T(role('button', 'Adicionar conta manual'), 'manual', { nth: 0 }),
      T(txt('Bilibili', { exact: true }), 'bili', { nth: 0, card: true }),
      T(txt('IA — títulos e hashtags', { exact: false }), 'ia', { nth: 0, card: true }),
      T('table', 'tabela', { nth: 0, pad: 0 }),
    ]);
  });
  await run('a-contas-info', async () => {
    await vp(800); await L.go(page, '/cortes/contas');
    await page.getByRole('button', { name: /Como obter as chaves do YouTube/ }).click(); await page.waitForTimeout(700);
    await L.shot(page, 'a-contas-info', [T('[role=dialog],[role=tooltip],[data-popover],div:has(> button[aria-label="Fechar"])', 'pop', { nth: 0 })]);
  });
  await run('a-contas-chaves', async () => {
    await vp(800); await L.go(page, '/cortes/contas');
    await page.getByRole('button', { name: 'Configurar chaves' }).first().click(); await page.waitForTimeout(800);
    await L.shot(page, 'a-contas-chaves', [
      T(dlg((d) => d.getByText('Não configurado')), 'status'),
      T(dlg((d) => d.getByText(/redirect URI/)), 'redirect', { up: 1, pad: 6 }),
      T(dlg((d) => d.getByLabel(/Client ID/)), 'id'),
      U([dlg((d) => d.getByLabel(/Client Secret/)), dlg((d) => d.getByRole('button', { name: 'Mostrar' }))], 'secret'),
      T(dlg((d) => d.getByRole('button', { name: 'Salvar' })), 'salvar'),
      T(dlg((d) => d.getByRole('button', { name: 'Testar' })), 'testar'),
      T(dlg((d) => d.getByRole('button', { name: 'Limpar tudo' })), 'limpar'),
    ]);
  });
  await b.close();
})();
