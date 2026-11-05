'use strict';

// Доступ к Redis через REST API Upstash (подключается в Vercel: Storage → Upstash Redis).
// Для тестов можно подменить хранилище через setBackend().
let backend = null;

function config() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function configured() {
  return !!backend || !!config();
}

async function call(...cmd) {
  if (backend) return backend(cmd.map(String));
  const c = config();
  if (!c) throw new Error('not_configured');
  const r = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd.map(String)),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function setBackend(fn) { backend = fn; }

module.exports = { call, configured, setBackend };
