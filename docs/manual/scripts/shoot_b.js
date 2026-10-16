// Capturas da Parte B (Séries IA). Uso: node shoot_b.js [prefixo]
const L = require('./lib.js'); const fs = require('fs');
const only = process.argv[2];
const T = (sel, label, extra = {}) => ({ sel, label, ...extra });
const U = (sels, label, extra = {}) => ({ sels, label, ...extra });
const txt = (s, o = {}) => (p) => p.getByText(s, { exact: o.exact ?? false });
const role = (r, name, o = {}) => (p) => p.getByRole(r, { name, ...o });
const dlg = (f) => (p) => f(p.getByRole('dialog'));
const SID = JSON.parse(fs.readFileSync(process.env.DEMO_DIR + '/series_id.json'));
(async () => {
  const b = await L.launch();
  const run = async (name, fn) => { if (only && !name.startsWith(only)) return; try { await fn(); } catch (e) { console.log('ERRO', name, e.message.slice(0, 300)); } };
  const { page } = await L.newSession(b, 'ana.demo', { h: 900 });
  const vp = (h) => page.setViewportSize({ width: 1440, height: h });
  await run('b-series', async () => {
    await vp(640); await L.go(page, '/series');
    await L.shot(page, 'b-series', [
      T(role('link', /Nova série/), 'nova'),
      T((p) => p.getByLabel('Status'), 'filtro'),
      T(txt('Ativa', { exact: true }), 'status', { nth: 0 }),
      T('[role=img]', 'barra', { nth: 0, pad: 4 }),
      T(txt(/^Próximo:/), 'proximo', { pad: 1 }),
      U([txt(/Sem limite de orçamento/), txt(/^Estimado:/)], 'custo', { pad: 1 }),
      T(txt(/precisam de atenção/), 'atencao', { pad: 1 }),
      T(txt('Uma faroleira solitária', { exact: false }), 'card', { card: true, nth: 0, pad: 2 }),
    ]);
  });
  // wizard
  const wiz = async () => {
    await L.go(page, '/series/nova');
    await page.getByLabel(/^Premissa/).fill('Um carteiro de cidade pequena descobre que cada carta sem remetente traz uma pista sobre o desaparecimento de toda uma rua, ocorrido há trinta anos.');
    const ch = page.locator('#wizard-channel'); const opts = await ch.locator('option').allTextContents(); await ch.selectOption({ label: opts.find((o) => o.includes('Mistérios')) });
  };
  const next = async () => { await page.getByRole('button', { name: 'Continuar' }).click(); await page.waitForTimeout(900); await page.evaluate(() => window.scrollTo(0, 0)); };
  await run('b-nova', async () => {
    await vp(780); await wiz();
    await L.shot(page, 'b-nova-1', [
      T('ol', 'passos', { nth: 0, pad: 6 }),
      T((p) => p.getByLabel(/^Título/), 'titulo'),
      T((p) => p.getByLabel(/^Premissa/), 'premissa', { up: 1, pad: 2 }),
      U([(p) => p.getByLabel(/^Gênero/), (p) => p.getByLabel(/^Tom/)], 'genero'),
      T('#wizard-channel', 'canal'),
      T(txt('Custo estimado'), 'custo', { card: true }),
    ]);
    await next();
    await vp(880);
    await L.shot(page, 'b-nova-2', [
      T(txt('Economia', { exact: true }), 'economia', { card: false, anc: 'label' }),
      T(txt('Híbrido (recomendado)'), 'hibrido', { anc: 'label' }),
      T(txt('Vídeo completo', { exact: true }), 'full', { anc: 'label' }),
      T((p) => p.getByLabel('Cenas em vídeo por episódio'), 'cenas', { up: 1 }),
      T(txt('Como calculamos'), 'calc', { anc: 'details' }),
      T(txt('Custo estimado'), 'custo', { card: true }),
    ]);
    await next();
    await vp(880);
    await L.shot(page, 'b-nova-3', [
      T('main select', 'imagem', { nth: 0 }),
      T('main select', 'video', { nth: 1 }),
      T('main select', 'tts', { nth: 2 }),
      T(txt(/^Voz\s*\*/), 'voz', { up: 1 }),
      T(txt('Teste, sem custo'), 'teste', { nth: 0 }),
      T(role('link', 'Configurar chave'), 'chave'),
    ]);
    await page.getByRole('radio', { name: /Voz falsa feminina/ }).check(); await next();
    await vp(900);
    await L.shot(page, 'b-nova-4', [
      U([(p) => p.getByLabel('Horário de publicação'), (p) => p.getByLabel('Fuso horário')], 'horario'),
      T(txt('Antecedência'), 'antec', { up: 1 }),
      T(txt('Privacidade', { exact: true }), 'priv', { up: 1 }),
      T((p) => p.getByLabel(/Exigir aprovação do roteiro/), 'aprov', { up: 1 }),
      T((p) => p.getByLabel(/Limite de regenerações/), 'regen', { up: 1 }),
      T((p) => p.getByLabel(/Orçamento da série/), 'orc', { up: 1 }),
      T((p) => p.getByLabel(/Monetização permitida/), 'monet', { up: 1 }),
    ]);
    await next();
    await vp(1200);
    await L.shot(page, 'b-nova-5', [
      T(txt('Título', { exact: true }), 'resumo', { up: 2, pad: 0 }),
      T(role('button', 'Editar'), 'editar', { nth: 0, pad: 2 }),
      T(txt(/Estimativa da temporada/), 'estim', { up: 0, pad: 0 }),
      T(txt(/Declaro que a premissa/), 'atest', { up: 1, pad: 2 }),
      T(role('button', /Criar série e planejar/), 'criar'),
    ]);
  });
  await run('b-serie', async () => {
    await vp(780); await L.go(page, `/series/${SID}`);
    await L.shot(page, 'b-serie', [
      U([txt('Pausar', { exact: true }), txt('Ações', { exact: true })], 'acoes', { pad: 4 }),
      T(role('tablist'), 'abas', { pad: 2 }),
      T(txt('Próximo passo para você'), 'proximo', { card: true }),
      T(txt('Linha do tempo (20 episódios)'), 'linha', { card: true }),
      T(txt('Custo', { exact: true }), 'custo', { card: true, nth: 0 }),
      T(txt('Configuração', { exact: true }), 'config', { card: true }),
    ]);
  });
  await run('b-biblia', async () => {
    await vp(1250); await L.go(page, `/series/${SID}?aba=biblia`);
    await L.shot(page, 'b-biblia', [
      T(role('button', 'Editar bíblia'), 'editar'),
      T(txt('Mundo', { exact: true }), 'mundo', { card: true }),
      T(txt('Estilo', { exact: true }), 'estilo', { card: true }),
      T(txt('Premissa-núcleo (somente leitura)'), 'nucleo', { up: 1 }),
      T(txt('Arco da temporada', { exact: true }), 'arco', { card: true }),
    ]);
  });
  await run('b-personagens', async () => {
    await vp(1950); await L.go(page, `/series/${SID}?aba=biblia`);
    await L.shot(page, 'b-personagens', [
      T(role('button', 'Todos', { exact: true }), 'filtro', { up: 1 }),
      T(txt(/^Otávio/), 'card', { card: true, nth: 0 }),
      T(txt('Imagem de ref.'), 'acoes', { nth: 0, up: 1, pad: 2 }),
      T(txt('Eventos de personagem'), 'eventos', { card: true }),
    ], { crop: [1230, 1870] });
  });
  await run('b-episodios', async () => {
    await vp(800); await L.go(page, `/series/${SID}?aba=episodios`);
    await L.shot(page, 'b-episodios', [
      U([role('button', 'Grade'), role('button', 'Lista')], 'modo'),
      T(txt('Precisam de ação', { exact: true }), 'filtro', { anc: 'label' }),
      T((p) => p.getByLabel('Fase'), 'fase'),
      T(txt('Ep. 1', { exact: true }), 'ep1', { card: true, nth: 0 }),
      T(txt(/Aprovar vídeo/), 'st1', { nth: 0 }),
      T(txt(/Aprovar roteiro/), 'st2', { nth: 0 }),
    ]);
  });
  await run('b-custos', async () => {
    await vp(1000); await L.go(page, `/series/${SID}?aba=custos`);
    await L.shot(page, 'b-custos', [
      T(txt(/^Total:/), 'total', { card: true }),
      T(txt('Por tipo'), 'tipo', { card: true }),
      T(txt('Por episódio'), 'ep', { card: true, nth: 0 }),
      T(txt(/Últimas \d+ operações/), 'ops', { card: true }),
    ]);
  });
  await run('b-ep-roteiro', async () => {
    await vp(1000); await L.go(page, `/series/${SID}?aba=episodios&ep=2`, 1500);
    await L.shot(page, 'b-ep-roteiro', [
      T(txt('Ep. 2 · Episódio 2', { exact: false }), 'cab', { nth: 0 }),
      T('ol', 'etapas', { nth: 0, pad: 4 }),
      T(txt(/Revise o roteiro/), 'banner', { up: 1, pad: 0 }),
      T(txt('Sinopse', { exact: true }), 'sinopse', { card: true }),
      T(txt('Validação', { exact: true }), 'valid', { card: true }),
      T(txt(/Roteiro \(revisão/), 'roteiro', { up: 1 }),
      U([dlg((d) => d.getByRole('button', { name: /^Regenerar/ })), dlg((d) => d.getByRole('button', { name: /^Aprovar roteiro/ }))], 'botoes', { pad: 4 }),
    ]);
  });
  await run('b-ep-video', async () => {
    await vp(1000); await L.go(page, `/series/${SID}?aba=episodios&ep=1`, 1500);
    await page.getByRole('dialog').locator('video').scrollIntoViewIfNeeded().catch(() => {}); await page.evaluate(() => { const v = document.querySelector('[role=dialog] video'); if (v) v.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(500);
    await L.shot(page, 'b-ep-video', [
      T(dlg((d) => d.locator('video')), 'player'),
      U([dlg((d) => d.getByRole('button', { name: /^Rejeitar/ })), dlg((d) => d.getByRole('button', { name: /^Aprovar vídeo/ }))], 'botoes', { pad: 4 }),
    ]);
  });
  await b.close();
})();
