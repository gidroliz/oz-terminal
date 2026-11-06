'use strict';

// Доступ к Redis для таблицы рекордов. Поддерживаются оба варианта из маркетплейса Vercel:
// 1) Upstash (REST): переменные *_KV_REST_API_URL / *_KV_REST_API_TOKEN или *UPSTASH_REDIS_REST_URL / *_TOKEN
//    — с любым префиксом, который можно задать при подключении базы;
// 2) обычный Redis по адресу REDIS_URL (redis:// или rediss://) — прямое подключение без библиотек.
// Для тестов хранилище подменяется через setBackend().
const net = require('net');
const tls = require('tls');

let backend = null;

function findEnv(re) {
  return Object.keys(process.env).filter((k) => re.test(k) && process.env[k]).sort((a, b) => a.length - b.length)[0] || null;
}

function restConfig() {
  const urlKey = findEnv(/(^|_)(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/);
  if (!urlKey) return null;
  const tokenKey = urlKey.replace(/URL$/, 'TOKEN');
  const token = process.env[tokenKey];
  if (!token) return null;
  return { kind: 'rest', url: process.env[urlKey].replace(/\/$/, ''), token, vars: [urlKey, tokenKey] };
}

function tcpConfig() {
  const key = findEnv(/(^|_)(REDIS_URL|KV_URL)$/);
  if (!key) return null;
  const raw = process.env[key];
  if (!/^rediss?:\/\//.test(raw)) return null;
  return { kind: 'tcp', url: raw, vars: [key] };
}

function config() {
  return restConfig() || tcpConfig();
}

function configured() {
  return !!backend || !!config();
}

// Имена переменных окружения, похожих на настройки базы (без значений) — для /api/health
function envHints() {
  return Object.keys(process.env).filter((k) => /REDIS|KV_|UPSTASH/.test(k)).sort();
}

// ─── REST (Upstash) ──────────────────────────────
async function restCall(c, cmd) {
  const r = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// ─── Протокол Redis (RESP) поверх TCP/TLS ────────
let conn = null;

function encode(cmd) {
  let s = `*${cmd.length}\r\n`;
  for (const a of cmd) s += `$${Buffer.byteLength(a)}\r\n${a}\r\n`;
  return s;
}

// Разбирает один ответ из буфера; возвращает [значение, длина] или null, если данных пока мало
function parse(buf, pos = 0) {
  const eol = buf.indexOf('\r\n', pos);
  if (eol < 0) return null;
  const type = String.fromCharCode(buf[pos]);
  const line = buf.toString('utf8', pos + 1, eol);
  const next = eol + 2;
  if (type === '+') return [line, next];
  if (type === '-') return [new Error(line), next];
  if (type === ':') return [Number(line), next];
  if (type === '$') {
    const n = Number(line);
    if (n < 0) return [null, next];
    if (buf.length < next + n + 2) return null;
    return [buf.toString('utf8', next, next + n), next + n + 2];
  }
  if (type === '*') {
    const n = Number(line);
    if (n < 0) return [null, next];
    const arr = [];
    let p = next;
    for (let i = 0; i < n; i++) {
      const r = parse(buf, p);
      if (!r) return null;
      arr.push(r[0]);
      p = r[1];
    }
    return [arr, p];
  }
  throw new Error('redis: unknown reply type ' + type);
}

function connect(c) {
  const u = new URL(c.url);
  const secure = u.protocol === 'rediss:';
  const opts = { host: u.hostname, port: Number(u.port) || 6379 };
  const sock = secure ? tls.connect({ ...opts, servername: u.hostname }) : net.connect(opts);
  const state = { sock, buf: Buffer.alloc(0), queue: [], ready: null };
  const fail = (err) => {
    state.queue.splice(0).forEach((q) => q.reject(err));
    if (conn === state) conn = null;
  };
  sock.on('data', (d) => {
    state.buf = Buffer.concat([state.buf, d]);
    let r;
    while (state.queue.length && (r = parse(state.buf))) {
      state.buf = state.buf.subarray(r[1]);
      const q = state.queue.shift();
      if (r[0] instanceof Error) q.reject(r[0]); else q.resolve(r[0]);
    }
  });
  sock.on('error', fail);
  sock.on('close', () => fail(new Error('redis: connection closed')));
  sock.setTimeout(10000, () => sock.destroy(new Error('redis: timeout')));
  const send = (cmd) => new Promise((resolve, reject) => {
    state.queue.push({ resolve, reject });
    sock.write(encode(cmd));
  });
  state.send = send;
  const user = decodeURIComponent(u.username || '');
  const pass = decodeURIComponent(u.password || '');
  state.ready = pass ? send(user ? ['AUTH', user, pass] : ['AUTH', pass]) : Promise.resolve();
  return state;
}

async function tcpCall(c, cmd) {
  if (!conn || conn.sock.destroyed) conn = connect(c);
  const state = conn;
  await state.ready;
  return state.send(cmd);
}

// ─── Общий вход ──────────────────────────────────
async function call(...cmd) {
  cmd = cmd.map(String);
  if (backend) return backend(cmd);
  const c = config();
  if (!c) throw new Error('not_configured');
  return c.kind === 'rest' ? restCall(c, cmd) : tcpCall(c, cmd);
}

function setBackend(fn) { backend = fn; }

function describe() {
  const c = backend ? { kind: 'memory', vars: [] } : config();
  return c ? { kind: c.kind, vars: c.vars } : null;
}

module.exports = { call, configured, setBackend, describe, envHints, _parse: parse };
