'use strict';

// Проверка прямого подключения к Redis по протоколу RESP (вариант REDIS_URL)
// и поиска переменных Upstash с произвольным префиксом.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { createFakeRedis } = require('./fake-redis');

const REDIS_MODULE = require.resolve('../api/_lib/redis');
const DB_VAR = /REDIS|KV_|UPSTASH/;

function freshRedis() {
  delete require.cache[REDIS_MODULE];
  return require('../api/_lib/redis');
}

function clearDbVars() {
  for (const k of Object.keys(process.env)) if (DB_VAR.test(k)) Reflect.deleteProperty(process.env, k);
}

function encodeReply(v) {
  if (v === null || v === undefined) return '$-1\r\n';
  if (typeof v === 'number') return `:${v}\r\n`;
  if (Array.isArray(v)) return `*${v.length}\r\n` + v.map(encodeReply).join('');
  if (v === 'OK' || v === 'PONG') return `+${v}\r\n`;
  return `$${Buffer.byteLength(String(v))}\r\n${v}\r\n`;
}

// Маленький сервер, понимающий протокол Redis; данные хранит в поддельной базе
function startRespServer(password) {
  const call = createFakeRedis();
  const { _parse } = freshRedis();
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      let authed = !password;
      sock.on('data', async (d) => {
        buf = Buffer.concat([buf, d]);
        let r;
        while ((r = _parse(buf))) {
          buf = buf.subarray(r[1]);
          const cmd = r[0];
          if (cmd[0] === 'AUTH') {
            authed = cmd[cmd.length - 1] === password;
            sock.write(authed ? '+OK\r\n' : '-ERR invalid password\r\n');
            continue;
          }
          if (!authed) { sock.write('-NOAUTH Authentication required\r\n'); continue; }
          try { sock.write(encodeReply(await call(cmd))); } catch (e) { sock.write(`-ERR ${e.message}\r\n`); }
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('REDIS_URL: команды идут по протоколу Redis с паролем', async () => {
  const srv = await startRespServer('s3cret');
  clearDbVars();
  process.env.REDIS_URL = `redis://default:s3cret@127.0.0.1:${srv.address().port}`;
  const redis = freshRedis();
  try {
    assert.deepEqual(redis.describe(), { kind: 'tcp', vars: ['REDIS_URL'] });
    assert.equal(await redis.call('PING'), 'PONG');
    await redis.call('ZADD', 'lb:test', 5000, 'a');
    await redis.call('ZADD', 'lb:test', 3000, 'b');
    assert.deepEqual(await redis.call('ZRANGE', 'lb:test', 0, -1), ['b', 'a']);
    await redis.call('HSET', 'players', 'a', 'Привет мир');
    assert.deepEqual(await redis.call('HMGET', 'players', 'a', 'zzz'), ['Привет мир', null]);
    assert.equal(await redis.call('INCR', 'n'), 1);
  } finally {
    Reflect.deleteProperty(process.env, 'REDIS_URL');
    freshRedis();
    srv.close();
  }
});

test('переменные Upstash находятся с любым префиксом', () => {
  clearDbVars();
  process.env.STORAGE_KV_REST_API_URL = 'https://example.upstash.io';
  process.env.STORAGE_KV_REST_API_TOKEN = 'token';
  process.env.STORAGE_KV_REST_API_READ_ONLY_TOKEN = 'ro';
  const redis = freshRedis();
  try {
    assert.deepEqual(redis.describe(), { kind: 'rest', vars: ['STORAGE_KV_REST_API_URL', 'STORAGE_KV_REST_API_TOKEN'] });
  } finally {
    clearDbVars();
    freshRedis();
  }
});
