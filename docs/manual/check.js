// Gera pre-visualizacao (sem a pagina do manual) de uma captura anotada para conferir as caixas: node check.js nome [nome...] -> /tmp scratch
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
function numPos(bx){ const s=bx.side||'tl'; const x = s.includes('r') ? bx.x+bx.w : bx.x; const y = s.includes('b') ? bx.y+bx.h : bx.y; return `left:${x}%;top:${y}%`; }
(async () => {
  const names = process.argv.slice(2); const out = process.env.CHECK_OUT;
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  for (const n of names) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'img', n + '.json')));
    const boxes = j.boxes.map((bx, i) => bx ? `<i class="box" style="left:${bx.x}%;top:${bx.y}%;width:${bx.w}%;height:${bx.h}%"></i><b class="num" style="${numPos(bx)}">${i + 1}</b>` : '').join('');
    const html = `<style>body{margin:0}.s{position:relative;width:${j.w}px;height:${j.h}px}img{width:100%;height:100%;display:block}.box{position:absolute;border:2px solid #2563eb;border-radius:6px;background:rgba(37,99,235,.07)}.num{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:#2563eb;color:#fff;font:700 13px/24px sans-serif;text-align:center}</style><div class="s"><img src="file://${path.join(__dirname, 'img', n + '.png')}">${boxes}</div>`;
    const p = await b.newPage({ viewport: { width: j.w, height: j.h } }); const hp = path.join(out, n + '.html'); fs.writeFileSync(hp, html); await p.goto('file://' + hp); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, n + '.check.png') }); await p.close();
  }
  await b.close();
})();
