// Helpers de montagem do manual (HTML). Sem dependências: node build.js gera manual.html
const fs = require('fs'); const path = require('path');
const IMG = path.join(__dirname, 'img');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PARTS = {
  A: { name: 'Parte A · Cortes', color: '#4f46e5', grad: 'linear-gradient(135deg,#312e81 0%,#4f46e5 60%,#6366f1 100%)' },
  B: { name: 'Parte B · Séries IA', color: '#7c3aed', grad: 'linear-gradient(135deg,#4c1d95 0%,#7c3aed 60%,#a855f7 100%)' },
  C: { name: 'Parte C · Administração e conta', color: '#0369a1', grad: 'linear-gradient(135deg,#0c4a6e 0%,#0369a1 60%,#0ea5e9 100%)' },
  D: { name: 'Parte D · Como tudo se conecta', color: '#047857', grad: 'linear-gradient(135deg,#064e3b 0%,#047857 60%,#10b981 100%)' },
  X: { name: '', color: '#4f46e5', grad: '' },
};

/** Figura com marcações. legend: [[titulo, descricao], ...] na mesma ordem das caixas do JSON. */
const DEFAULTS = {
  'a-canais': { nosb: 1, crop: [0, 520], maxh: 100 }, 'a-canal-novo': { nosb: 1, crop: [100, 1250], maxh: 150 }, 'a-fontes': { nosb: 1, crop: [0, 740], maxh: 120 },
  'a-fonte-form': { nosb: 1, crop: [250, 1000], maxh: 125 }, 'a-upload': { nosb: 1, crop: [0, 1000], maxh: 125 }, 'a-analisar': { crop: [140, 760, 340, 1100], maxh: 108 },
  'a-jobs': { nosb: 1, crop: [0, 700], maxh: 100 }, 'a-revisao': { nosb: 1, crop: [0, 900], maxh: 128 }, 'a-revisao-lote': { nosb: 1, crop: [95, 250] },
  'a-corte': { crop: [60, 990, 272, 1168], maxh: 108 }, 'c-usuario-novo': { crop: [95, 905, 420, 1020], maxh: 88 }, 'a-publicacoes': { nosb: 1, crop: [0, 1160], maxh: 150 }, 'a-agenda': { nosb: 1, crop: [0, 480], maxh: 75 },
  'a-contas': { nosb: 1, crop: [0, 1100], maxh: 152 }, 'b-series': { nosb: 1, crop: [0, 470], maxh: 70 }, 'b-serie': { nosb: 1, crop: [0, 720], maxh: 108 },
  'b-biblia': { nosb: 1, crop: [140, 1250], maxh: 152 }, 'b-personagens': { nosb: 1, crop: [1230, 1870], maxh: 105 }, 'b-episodios': { nosb: 1, crop: [140, 780], maxh: 100 },
  'b-custos': { nosb: 1, crop: [140, 1000], maxh: 135 }, 'c-usuarios': { nosb: 1, crop: [0, 380], maxh: 70 }, 'c-conta': { nosb: 1, crop: [0, 1000], maxh: 140 },
  'c-auditoria': { nosb: 1, crop: [0, 440], maxh: 70 }, 'a-publicar': { crop: [215, 685, 350, 1090], maxh: 85 }, 'a-login': { crop: [170, 630, 500, 940], maxh: 90 },
};
function fig(name, legend, o = {}) {
  const j = JSON.parse(fs.readFileSync(path.join(IMG, name + '.json')));
  o = { ...o, ...(DEFAULTS[name] || {}) };
  const [y0, y1, x0, x1] = [o.crop?.[0] ?? j.crop?.[0] ?? 0, o.crop?.[1] ?? j.crop?.[1] ?? j.h, o.crop?.[2] ?? (o.nosb ? 256 : 0), o.crop?.[3] ?? j.w];
  const W = x1 - x0, H = y1 - y0;
  if (legend && legend.length !== j.boxes.length) console.warn(`!! ${name}: legenda(${legend.length}) != caixas(${j.boxes.length})`);
  const hide = new Set(o.hide || []);
  const items = []; let n = (o.startAt || 1) - 1;
  j.boxes.forEach((bx, i) => {
    if (!bx || hide.has(i)) return;
    const px = bx.x / 100 * j.w, py = bx.y / 100 * j.h, pw = bx.w / 100 * j.w, ph = bx.h / 100 * j.h;
    // fora do recorte? descarta
    if (py + ph < y0 + 2 || py > y1 - 2 || px + pw < x0 + 2 || px > x1 - 2) return;
    n += 1; items.push({ n, i, px, py, pw, ph, side: bx.side || 'tl' });
  });
  const boxes = items.map((b) => {
    const l = (b.px - x0) / W * 100, t = (b.py - y0) / H * 100, w = b.pw / W * 100, h = b.ph / H * 100;
    let nx = b.side.includes('r') ? l + w : l, ny = b.side.includes('b') ? t + h : t;
    return `<i class="box" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"></i><b class="num" style="left:max(2.8mm,min(calc(100% - 2.8mm),${nx}%));top:max(2.8mm,min(calc(100% - 2.8mm),${ny}%))">${b.n}</b>`;
  }).join('');
  const img = `<div class="in" style="left:${-x0 / W * 100}%;top:${-y0 / H * 100}%;width:${j.w / W * 100}%;height:${j.h / H * 100}%"><img src="img/${name}.png"></div>`;
  const wmm = o.maxh ? `width:${Math.min(182, o.maxh * W / H).toFixed(1)}mm;` : (o.width ? `width:${o.width};` : '');
  const f = `<div class="fig" style="${wmm}aspect-ratio:${W}/${H}">${img}${boxes}</div>`;
  let lg = '';
  if (legend) {
    const li = items.map((b) => legend[b.i] ? `<li><span class="n">${b.n}</span><div><b>${legend[b.i][0]}</b>${legend[b.i][1] ? ' <span class="d">' + legend[b.i][1] + '</span>' : ''}</div></li>` : '').join('');
    lg = `<ol class="legend ${o.cols === 1 ? 'c1' : 'c2'}">${li}</ol>`;
  }
  return f + (o.cap ? `<div class="figcap">${o.cap}</div>` : '') + lg + '';
}
/** Só a figura (sem legenda), útil para legendar à parte. Retorna {html, items} */
const callout = (kind, title, html) => `<div class="box3 ${kind}"><div class="t">${title}</div>${html}</div>`;
const why = (html) => callout('why', 'Por que é assim', html);
const how = (html) => callout('how', 'Como funciona', html);
const warn = (html) => callout('warn', 'Atenção', html);

/** Página genérica de tela. */
function screen({ part, tag, title, intro, body }) {
  return { part, html: `<p class="tag">${tag}</p><h1>${title}</h1>${intro ? `<p class="intro">${intro}</p>` : ''}${body}` };
}
function partCover(part, lead, items) {
  const P = PARTS[part];
  return { part, cover: 'part', style: `background:${P.grad}`, html: `<div class="kicker">${P.name.split(' · ')[0]}</div><h1>${P.name.split(' · ')[1]}</h1><p class="lead">${lead}</p><ol>${items.map(([a, b]) => `<li>${a}${b ? `<span>${b}</span>` : ''}</li>`).join('')}</ol>` };
}

function render(pages) {
  // numeração: índice no array + 1
  const toc = [];
  pages.forEach((p, i) => { if (p.toc) toc.push({ ...p.toc, part: p.part, page: i + 1 }); });
  const tocHtml = (() => {
    let cur = '', out = '';
    for (const t of toc) {
      if (t.level === 1) { out += `<div class="part"><i style="background:${PARTS[t.part].color}"></i>${t.label}<span style="margin-left:auto;font-weight:700">${t.page}</span></div>`; cur = t.part; }
      else out += `<div class="row"><span>${t.label}</span><span class="dots"></span><span class="pg">${t.page}</span></div>`;
    }
    return out;
  })();
  const sections = pages.map((p, i) => {
    const num = i + 1;
    const P = PARTS[p.part || 'X'];
    const html = (p.html || '').replace('{{TOC}}', tocHtml);
    if (p.cover === 'main') return `<section class="page cover" data-p="${num}"><div class="inner">${html}</div></section>`;
    if (p.cover === 'part') return `<section class="page partcover" data-p="${num}" style="${p.style}"><div class="inner">${html}</div></section>`;
    const label = p.part && p.part !== 'X' ? PARTS[p.part].name : 'Projetos Cortes';
    return `<section class="page" data-p="${num}" style="--accent:${P.color}"><div class="inner">${html}</div><footer class="pf"><span>Projetos Cortes · Manual da plataforma${p.part && p.part !== 'X' ? ' · ' + PARTS[p.part].name.split(' · ')[0] : ''}</span><b>${num}</b></footer></section>`;
  }).join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual de Uso — Projetos Cortes</title><link rel="stylesheet" href="style.css"></head><body>\n${sections}\n</body></html>`;
}
module.exports = { fig, callout, why, how, warn, screen, partCover, render, PARTS, esc };
