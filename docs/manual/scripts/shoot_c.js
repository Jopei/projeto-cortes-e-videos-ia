// Capturas da Parte C (Administração e conta), mobile e tema escuro. Uso: node shoot_c.js [prefixo]
const L = require('./lib.js');
const only = process.argv[2];
const T = (sel, label, extra = {}) => ({ sel, label, ...extra });
const U = (sels, label, extra = {}) => ({ sels, label, ...extra });
const txt = (s, o = {}) => (p) => p.getByText(s, { exact: o.exact ?? false });
const role = (r, name, o = {}) => (p) => p.getByRole(r, { name, ...o });
const dlg = (f) => (p) => f(p.getByRole('dialog'));
(async () => {
  const b = await L.launch();
  const run = async (name, fn) => { if (only && !name.startsWith(only)) return; try { await fn(); } catch (e) { console.log('ERRO', name, e.message.slice(0, 300)); } };
  const { page } = await L.newSession(b, 'ana.demo', { h: 900 });
  const vp = (h) => page.setViewportSize({ width: 1440, height: h });
  await run('c-usuarios', async () => {
    await vp(560); await L.go(page, '/admin/usuarios');
    await L.shot(page, 'c-usuarios', [
      T(role('button', /Novo usuário/), 'novo'),
      T(txt('Usuário', { exact: true }), 'papel', { nth: 1, anc: 'td' }),
      T(txt(/Armazenamento$/), 'uso', { nth: 0, anc: 'td' }),
      T(txt(/Análises hoje/), 'cotas', { nth: 0 }),
      T(role('button', 'Editar'), 'editar', { nth: 2 }),
      T(role('columnheader', /Cortes/), 'cp'),
    ]);
  });
  await run('c-usuario-novo', async () => {
    await vp(1000); await L.go(page, '/admin/usuarios');
    await page.getByRole('button', { name: /Novo usuário/ }).click(); await page.waitForTimeout(700);
    const d = page.getByRole('dialog');
    await d.getByLabel(/^Usuário/).fill('carla.demo'); await d.getByText('Gerar senha forte').click();
    await d.getByRole('button', { name: 'Ocultar' }).click(); await d.getByLabel(/^Nome/).fill('Carla Demo'); await d.getByLabel(/^E-mail/).fill('carla@example.com');
    const q = [['Armazenamento (GB)', '50'], ['Análises por dia', '10'], ['Máximo de canais', '4'], ['Séries IA ativas (máx.)', '1'], ['Orçamento mensal de IA (US$)', '20']];
    for (const [l, v] of q) await d.getByLabel(l).fill(v).catch((e) => console.log('quota', l));
    await L.shot(page, 'c-usuario-novo', [
      T(dlg((x) => x.getByLabel(/^Usuário/)), 'usuario'),
      U([dlg((x) => x.getByLabel(/^Senha/)), dlg((x) => x.getByText('Gerar senha forte'))], 'senha'),
      U([dlg((x) => x.getByLabel(/^Nome/)), dlg((x) => x.getByLabel(/^E-mail/))], 'nome'),
      T(dlg((x) => x.getByLabel(/^Administrador/)), 'admin', { up: 1 }),
      T(dlg((x) => x.getByLabel(/Exigir troca/)), 'troca', { up: 1 }),
      U([dlg((x) => x.getByText('Cotas', { exact: true })), dlg((x) => x.getByLabel('Orçamento mensal de IA (US$)'))], 'cotas', { pad: 6 }),
      T(dlg((x) => x.getByText('Sem limite')), 'semlimite', { nth: 0 }),
      T(dlg((x) => x.getByRole('button', { name: 'Criar usuário' })), 'criar'),
    ]);
  });
  await run('c-vercomo', async () => {
    await vp(1000); await L.go(page, '/cortes/canais');
    await page.getByRole('button', { name: /Ana Demo/ }).click(); await page.waitForTimeout(500);
    await page.locator('#admin-view-picker').selectOption({ label: 'Bruno Demo' }); await page.waitForTimeout(1500);
    await L.shot(page, 'c-vercomo', [
      T(txt(/Vendo como Bruno Demo\./), 'faixa', { up: 1, pad: 0 }),
      T(txt('Vendo como Bruno Demo', { exact: true }), 'chip'),
      T('#admin-view-picker', 'picker', { up: 1 }),
      T(txt('Dicas Rápidas', { exact: true }), 'dados', { card: true, nth: 0 }),
      T(role('button', /Ana Demo/), 'usuario'),
    ]);
    await page.locator('#admin-view-picker').selectOption(''); await page.waitForTimeout(500); await page.keyboard.press('Escape');
  });
  await run('c-auditoria', async () => {
    await vp(800); await L.go(page, '/cortes/auditoria');
    await page.getByPlaceholder(/ação, entidade/).fill('publication'); await page.waitForTimeout(600);
    await L.shot(page, 'c-auditoria', [
      T(txt('Filtrar nesta página'), 'filtro', { up: 1 }),
      T(role('columnheader', 'Data'), 'data'),
      T(role('columnheader', 'Usuário'), 'usuario'),
      T(role('columnheader', 'Ação'), 'acao'),
      T(role('columnheader', 'Detalhes'), 'detalhes'),
    ]);
  });
  await run('c-ctrlk', async () => {
    await vp(800); await L.go(page, '/cortes');
    await page.keyboard.press('Control+k'); await page.waitForTimeout(500); await page.keyboard.type('rev'); await page.waitForTimeout(500);
    await L.shot(page, 'c-ctrlk', [
      T(dlg((d) => d.getByPlaceholder(/Buscar tela/)), 'campo'),
      T(dlg((d) => d.getByRole('option').first()), 'resultado'),
      T(dlg((d) => d.getByText(/navegar/)), 'ajuda', { up: 1 }),
    ]);
    await page.keyboard.press('Escape');
  });
  await run('c-recolhida', async () => {
    await vp(760); await L.go(page, '/cortes/revisao');
    await page.getByRole('button', { name: /recolher|Recolher|menu lateral/i }).first().click(); await page.waitForTimeout(600);
    await L.shot(page, 'c-recolhida', [
      T(role('button', /expandir|Expandir|recolher|Recolher|menu lateral/i), 'botao', { nth: 0 }),
      T('aside,nav', 'barra', { nth: 0, pad: 0, side: 'tr' }),
    ]);
    await page.getByRole('button', { name: /expandir|Expandir|menu lateral/i }).first().click().catch(() => {});
  });
  // conta como usuario comum
  const bruno = await L.newSession(b, 'bruno.demo', { h: 900 });
  await run('c-conta', async () => {
    await bruno.page.setViewportSize({ width: 1440, height: 1000 }); await L.go(bruno.page, '/conta');
    await L.shot(bruno.page, 'c-conta', [
      T(txt('Meus dados'), 'dados', { card: true }),
      T(txt('Uso e cotas'), 'cotas', { card: true }),
      T(txt('Trocar senha', { exact: true }), 'senha', { card: true, nth: 0 }),
      T((p) => p.getByLabel('Nova senha', { exact: true }), 'nova', { up: 1 }),
    ]);
  });
  // escuro
  const dark = await L.newSession(b, 'ana.demo', { h: 900, theme: 'dark' });
  await run('c-escuro', async () => {
    await L.go(dark.page, '/cortes');
    await dark.page.getByRole('button', { name: /Ana Demo/ }).click(); await dark.page.waitForTimeout(500);
    await L.shot(dark.page, 'c-escuro', [
      T(txt(/^Tema/), 'tema', { nth: 0 }),
    ]);
  });
  // mobile
  const mob = await L.newSession(b, 'ana.demo', { w: 390, h: 844, scale: 2 });
  await run('m-visao', async () => { await L.go(mob.page, '/cortes'); await L.shot(mob.page, 'm-visao', []); });
  await run('m-revisao', async () => { await L.go(mob.page, '/cortes/revisao'); await L.shot(mob.page, 'm-revisao', []); });
  await run('m-series', async () => { await L.go(mob.page, '/series'); await L.shot(mob.page, 'm-series', []); });
  await run('m-menu', async () => {
    await L.go(mob.page, '/cortes'); await mob.page.getByRole('button', { name: /menu|Menu|abrir/i }).first().click().catch(() => {}); await mob.page.waitForTimeout(700); await L.shot(mob.page, 'm-menu', []);
  });
  await b.close();
})();
