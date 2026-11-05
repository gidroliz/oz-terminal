'use strict';

// Модерация. Требует переменную окружения ADMIN_TOKEN и заголовок Authorization: Bearer <ADMIN_TOKEN>.
// GET  /api/admin?mode=normal              → полный список с id игроков
// POST /api/admin { action: 'remove', mode, id }  → удалить результат игрока из таблицы режима
// POST /api/admin { action: 'rename', id, name }  → принудительно сменить позывной
const crypto = require('crypto');
const redis = require('./_lib/redis');
const { readBody, query, send } = require('./_lib/http');
const { MODES } = require('./_lib/rules');

function authorized(req) {
  const secret = process.env.ADMIN_TOKEN;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !got || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

module.exports = async function handler(req, res) {
  if (!authorized(req)) return send(res, 403, { ok: false, error: 'forbidden' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    if (req.method === 'GET') {
      const mode = query(req).mode;
      if (!MODES[mode]) return send(res, 400, { ok: false, error: 'bad_mode' });
      const ids = (await redis.call(MODES[mode].endless ? 'ZREVRANGE' : 'ZRANGE', `lb:${mode}`, 0, -1)) || [];
      const names = ids.length ? await redis.call('HMGET', 'players', ...ids) : [];
      return send(res, 200, { ok: true, rows: ids.map((id, i) => ({ rank: i + 1, id, name: names[i] })) });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.action === 'remove' && MODES[b.mode]) {
        await redis.call('ZREM', `lb:${b.mode}`, b.id);
        await redis.call('HDEL', `lbinfo:${b.mode}`, b.id);
        return send(res, 200, { ok: true });
      }
      if (b.action === 'rename' && b.name) {
        await redis.call('HSET', 'players', b.id, String(b.name).slice(0, 16));
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { ok: false, error: 'bad_action' });
    }
    return send(res, 405, { ok: false, error: 'method' });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
