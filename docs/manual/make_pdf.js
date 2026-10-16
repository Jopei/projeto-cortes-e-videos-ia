// Renderiza manual.html em PDF A4 (Chromium headless) e verifica estouro de página. Uso: node make_pdf.js [saida.pdf]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'Manual-Projetos-Cortes.pdf');
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const page = await b.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto('file://' + path.join(__dirname, 'manual.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200);
  const issues = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => {
    const inner = p.querySelector('.inner'); if (!inner) return null;
    const over = inner.scrollHeight - inner.clientHeight; const free = inner.clientHeight - [...inner.children].reduce((m, c) => Math.max(m, c.offsetTop + c.offsetHeight), 0);
    return { n: p.dataset.p, over, free: Math.round(free) };
  }).filter(Boolean));
  const bad = issues.filter((x) => x.over > 1 || x.free < 0);
  console.log('páginas:', issues.length + (0), 'com estouro:', bad.map((x) => `${x.n}(+${x.over}px)`).join(' ') || 'nenhuma');
  console.log('sobra (px) por página:', issues.map((x) => `${x.n}:${x.free}`).join(' '));
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close(); console.log('PDF:', out);
})();
