# Manual de uso (PDF ilustrado)

Fonte do `Manual-Projetos-Cortes.pdf`: HTML/CSS gerado por script, com capturas reais do painel anotadas por overlays.

- `pages.js` (conteúdo), `build-lib.js` + `build.js` (geram `manual.html`), `style.css`, `fonts/` (Inter), `img/` (capturas PNG + `.json` com as caixas numeradas em % da imagem).
- PDF: `node make_pdf.js saida.pdf` (Playwright/Chromium; avisa se alguma página estourar o A4).
- `scripts/`: dados de demonstração FICTÍCIOS e capturas (`shoot_a|b|c.js`, `lib.js`, `01..09_*.py`, `run_all.sh`) e `99_cleanup.sh`, que apaga dados de domínio e objetos S3 (`WITH_USERS=1` remove os usuários `*.demo`).
- Senha da demo vem de `DEMO_PW` (env); nada de senha real no repositório.
