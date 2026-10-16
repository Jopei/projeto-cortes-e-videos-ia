// Biblioteca de captura: login, mascaramento de nome real, captura com caixas numeradas.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const WEB = 'http://localhost:13000';
const OUT = path.resolve(__dirname, '../img');
const PW = process.env.DEMO_PW;
const REAL = process.env.REAL_USER || ''; // nome real a mascarar (passado por env, nao gravado)
async function launch() {
  return chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome' });
}
async function newSession(browser, username, { w = 1440, h = 900, theme = 'light', scale = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: theme, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
  const page = await ctx.newPage();
  if (username) {
    const r = await ctx.request.post('http://localhost:18000/api/auth/login', { data: { username, password: PW } });
    if (r.status() !== 200) throw new Error('login ' + r.status());
  }
  return { ctx, page };
}
// troca texto do usuario real por um nome ficticio (DOM, antes de cada captura)
async function mask(page) {
  if (!REAL) return;
  await page.evaluate((real) => {
    const re = new RegExp(real, 'gi');
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (re.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(re, 'carlos.demo');
    document.querySelectorAll('option').forEach(o => { if (re.test(o.textContent)) o.textContent = o.textContent.replace(re, 'carlos.demo'); });
    document.querySelectorAll('[aria-label],[title]').forEach(e => { for (const a of ['aria-label', 'title']) { const v = e.getAttribute(a); if (v && re.test(v)) e.setAttribute(a, v.replace(re, 'carlos.demo')); } });
    document.querySelectorAll('input').forEach(i => { if (re.test(i.value)) i.value = i.value.replace(re, 'carlos.demo'); });
  }, REAL);
}
async function go(page, p, wait = 900) {
  await page.goto(WEB + p, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(wait);
}
/** Captura viewport e grava boxes (em % da imagem) para os seletores dados. targets: [{sel, text, nth, pad, label}] */
async function shot(page, name, targets = [], opts = {}) {
  await mask(page);
  const vp = page.viewportSize();
  const boxes = [];
  const resolve = (page, t, s) => {
    let loc = typeof s === 'function' ? s(page) : page.locator(s);
    loc = loc.filter({ visible: true }).nth(t.nth || 0);
    if (t.card) loc = loc.locator('xpath=ancestor-or-self::*[contains(@class,"rounded-xl")][1]');
    if (t.anc) loc = loc.locator(`xpath=ancestor-or-self::${t.anc}[1]`);
    if (t.up) loc = loc.locator('xpath=' + Array(t.up).fill('..').join('/'));
    return loc;
  };
  for (const t of targets) {
    const sels = t.sels || [t.sel];
    let bb = null;
    for (const s of sels) {
      const b1 = await resolve(page, t, s).boundingBox({ timeout: 4000 }).catch(() => null);
      if (!b1) { bb = null; break; }
      if (!bb) bb = { ...b1 };
      else { const x2 = Math.max(bb.x + bb.width, b1.x + b1.width), y2 = Math.max(bb.y + bb.height, b1.y + b1.height); bb.x = Math.min(bb.x, b1.x); bb.y = Math.min(bb.y, b1.y); bb.width = x2 - bb.x; bb.height = y2 - bb.y; }
    }
    if (!bb) { console.log('  !! sem box:', name, t.label || String(t.sel)); boxes.push(null); continue; }
    const pad = t.pad ?? 3;
    boxes.push({ x: Math.max(0, bb.x - pad) / vp.width * 100, y: Math.max(0, bb.y - pad) / vp.height * 100, w: Math.min(vp.width - Math.max(0, bb.x - pad), bb.width + pad * 2) / vp.width * 100, h: (bb.height + pad * 2) / vp.height * 100, side: t.side || 'tl' });
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ w: vp.width, h: vp.height, boxes, crop: opts.crop || null }));
  console.log('ok', name, boxes.filter(Boolean).length + '/' + targets.length);
}
module.exports = { launch, newSession, go, shot, mask, WEB, OUT, PW };
