// Gera manual.html a partir de pages.js. Uso: node build.js
const fs = require('fs'); const path = require('path');
const { render } = require('./build-lib.js');
const pages = require('./pages.js');
fs.writeFileSync(path.join(__dirname, 'manual.html'), render(pages));
console.log('manual.html:', pages.length, 'páginas');
