'use strict';

// Общие помощники: статический сервер для игры, запуск браузера и загрузка скриптов игры в node.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

// Обработчики api/ с поддельной базой в памяти (в каждом тестовом прогоне своя)
function apiHandlers() {
  const redis = require('../api/_lib/redis');
  const { createFakeRedis } = require('./fake-redis');
  redis.setBackend(createFakeRedis());
  return {
    run: require('../api/run'),
    score: require('../api/score'),
    leaderboard: require('../api/leaderboard'),
    name: require('../api/name'),
    health: require('../api/health'),
  };
}

function startServer({ api = true } = {}) {
  const handlers = api ? apiHandlers() : null;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const m = url.match(/^\/api\/(\w+)$/);
      if (m) {
        const h = handlers && handlers[m[1]];
        if (!h) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"ok":false}'); return; }
        h(req, res);
        return;
      }
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

// Загружает файлы игры в изолированный контекст и возвращает указанные глобальные имена
function loadGameScripts(files, names) {
  const ctx = vm.createContext({ console, navigator: { language: 'ru' }, localStorage: { getItem: () => null } });
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
    + `\n;({ ${names.join(', ')} })`;
  return vm.runInContext(code, ctx);
}

module.exports = { ROOT, startServer, loadGameScripts };
